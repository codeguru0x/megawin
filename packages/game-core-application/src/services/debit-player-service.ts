/**
 * DebitPlayerService — Shared service xử lý WAL + tenant debit cho place-bet.
 *
 * Encapsulate toàn bộ lifecycle:
 *   1. generateTx() — tạo UUIDv7, caller dùng gán ticketDoc.tx
 *   2. debit(input) — insert WAL + gọi tenant debit
 *   3. markCompleted(tx) — sau khi save ticket thành công
 *
 * ## FLOW CHI TIẾT (hot path — place-bet):
 *
 * ```
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ Caller (place-bet use case)                                     │
 * │                                                                  │
 * │  const tx = debitService.generateTx();                          │
 * │  // ... build ticketDoc (gán tx), entryDocs ...                 │
 * │  const { balance } = await debitService.debit({ tx, ...input });│
 * │  await placeBetStore.saveAtomically(ticketDoc, entryDocs);      │
 * │  await debitService.markCompleted(tx);                          │
 * └──────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## CRASH SCENARIOS & RECOVERY:
 *
 * | Crash tại bước | WAL state       | Ticket? | Scheduler hành động                        |
 * |----------------|-----------------|---------|--------------------------------------------|
 * | Sau insertWAL  | DEBIT_PENDING   | Không   | Confirm debit → failed (NOT_FOUND) → xoá WAL |
 * | Sau debit call | DEBIT_PENDING   | Không   | Confirm debit → success → no ticket → credit rollback |
 * | Sau save       | DEBIT_PENDING   | Có      | Confirm debit → success → ticket exists → markCompleted |
 * | Sau complete   | COMPLETED       | Có      | Không cần — TTL cleanup 14 ngày            |
 *
 * ## SCHEDULER:
 *
 * RecoverOrphanTxIntentsUseCase (chạy mỗi 2 phút) scan orphan DEBIT_PENDING > 30s:
 * 1. Increment recoveryAttempt
 * 2. GET /transaction/{tx}/status → xác nhận debit đã xảy ra?
 *    - "failed" (NOT_FOUND / khác) → xoá WAL (debit chưa xảy ra)
 *    - "success" → check ticket exists
 *    - timeout → retry lần sau
 * 3. Ticket exists? → markCompleted. Không? → credit rollback → markRolledBack.
 * 4. recoveryAttempts ≥ 20 → MANUAL_REVIEW + alert.
 *
 * @see TxIntentDoc — WAL document structure
 * @see RecoverOrphanTxIntentsUseCase — recovery logic
 */

import { AppException } from "@megawin/shared/errors";
import { ApiClientError } from "@megawin/shared/api-types";
import { TransactionAction, TransactionReason } from "@megawin/shared/types";
import type { Currency } from "@megawin/shared/types";
import { tenantGateway } from "@megawin/tenant-gateway";
import type { TenantGatewayClient, TransactionRequest } from "@megawin/tenant-gateway";
import { generateId, logError, toTenantUsername } from "@megawin/shared/utils";
import { TxIntentPhase } from "@megawin/game-core/entities";

import { TxIntentRepository } from "../infras/repos/tx-intent-repo";

// ─────────────────────────────────────────────────────────────────────────────
// Input / Output
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input cho debit operation — generic, không phụ thuộc game cụ thể.
 *
 * Mọi trường mirror TransactionRequest + internal ownership fields.
 * Khi thêm game mới, KHÔNG cần sửa interface này — chỉ truyền đúng giá trị.
 *
 * **Caller dùng `debitService.generateTx()` để tạo `tx` TRƯỚC khi build ticketDoc.**
 */
export interface DebitPlayerInput {
  /**
   * Transaction ID (UUIDv7) — idempotency key, unique per bet.
   * Caller generate bằng `debitService.generateTx()` TRƯỚC khi build ticketDoc.
   * @example "019577a0-1234-7abc-8def-0123456789ab"
   */
  tx: string;

  /** ID tenant/đại lý sở hữu bet. */
  tenantId: string;

  /** ID tài khoản player trong MegaWin (internal). */
  accountId: string;

  /**
   * Megawin username của player.
   * @example "john_doe@acme"
   */
  username: string;

  /** Tổng số tiền cược (VND). Luôn > 0. */
  amount: number;

  /** Mã tiền tệ ISO 4217. */
  currency: Currency;

  /**
   * Mã sản phẩm game.
   * @example "keno", "mega645", "lotto535"
   */
  gameId: string;

  /**
   * Danh sách kỳ quay bet này tham gia.
   * Multi-draw: 1 debit cover nhiều draws.
   * @example ["2026-04-10.095", "2026-04-10.096"]
   */
  roundIds: string[];

  /**
   * Mô tả giao dịch — hiển thị trên lịch sử giao dịch player.
   * @example "Đặt cược Keno 3 kỳ 2026-04-10.095→097"
   */
  description?: string;

  /**
   * Dữ liệu mở rộng game-specific.
   * @example { ticketNo: "KENO-20260410-00001" }
   */
  metadata?: Record<string, unknown>;
}

/**
 * Kết quả debit thành công.
 *
 * Không trả `tx` vì caller đã generate và truyền vào `DebitPlayerInput.tx`.
 * Chỉ trả `balance` — thông tin mới duy nhất từ tenant response.
 */
export interface DebitPlayerResult {
  /** Số dư ví player sau debit (VND). Từ response tenant. */
  balance: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shared service xử lý WAL + tenant debit cho tất cả game place-bet.
 *
 * Cách dùng trong place-bet use case:
 * ```ts
 * const debitService = new DebitPlayerService();
 * const tx = debitService.generateTx();
 *
 * // ... build ticketDoc (gán tx vào ticketDoc.tx) + entryDocs ...
 *
 * // Step 1: Debit (WAL + tenant call) — ngay trước save
 * const { balance } = await debitService.debit({ tx, ...input });
 *
 * // Step 2: Save ticket + entries (game-specific)
 * await placeBetStore.saveAtomically(ticketDoc, entryDocs);
 *
 * // Step 3: Mark WAL completed
 * await debitService.markCompleted(tx);
 * ```
 *
 * **KHÔNG gọi markCompleted bên trong debit()** vì:
 * - Giữa debit và save, ticket chưa tồn tại → nếu crash sau markCompleted
 *   thì scheduler thấy COMPLETED nhưng ticket không có → mất tiền.
 * - markCompleted chỉ gọi SAU save → đảm bảo ticket luôn tồn tại khi WAL = COMPLETED.
 */
export class DebitPlayerService {
  private readonly txIntentRepo = new TxIntentRepository();

  /**
   * Tạo Transaction ID (UUIDv7) — gọi sớm, gán vào ticketDoc.tx trước khi build document.
   *
   * Pure function, không side effect, không DB call.
   * Dùng method này thay vì import `generateId` trực tiếp —
   * developer chỉ cần biết `DebitPlayerService`, không cần biết implementation detail.
   */
  generateTx(): string {
    return generateId();
  }

  /**
   * Ghi WAL + gọi tenant debit API.
   *
   * Flow: insertWAL → resolve gateway → call tenant → handle response.
   *
   * @throws AppException.serviceUnavailable khi WAL insert fail (MongoDB down)
   * @throws AppException.badRequest khi tenant reject debit (insufficient balance, etc.)
   * @throws AppException.serviceUnavailable khi tenant unreachable (WAL giữ cho scheduler)
   */
  async debit(input: DebitPlayerInput): Promise<DebitPlayerResult> {
    const { tx } = input;

    await this.insertWal(input);
    const client = await this.resolveGateway(tx, input.tenantId);

    // Gọi sang tenant debit API
    return await this.callTenantDebit(input, client);
  }

  /**
   * Đánh dấu WAL đã hoàn tất — gọi SAU khi save ticket thành công.
   *
   * Nếu crash trước khi gọi method này:
   * - WAL vẫn ở DEBIT_PENDING
   * - Scheduler confirm debit → success → check ticket → exists → markCompleted
   * - Kết quả: tự heal, không mất tiền
   *
   * Idempotent: gọi nhiều lần không sao (guard: phase must be DEBIT_PENDING).
   */
  async markCompleted(tx: string): Promise<void> {
    await this.txIntentRepo.markCompleted(tx);
  }

  // ── Private: WAL Insert ───────────────────────────────────────────────────

  /**
   * Insert WAL record (DEBIT_PENDING) — anchor point cho crash recovery.
   *
   * Nếu crash sau đây mà trước khi gọi tenant → scheduler thấy DEBIT_PENDING,
   * confirm debit → failed (NOT_FOUND) → xoá WAL. Không mất tiền.
   *
   * Nếu MongoDB fail → throw serviceUnavailable (chưa gọi tenant, an toàn 100%).
   */
  private async insertWal(input: DebitPlayerInput): Promise<void> {
    try {
      const now = new Date();

      await this.txIntentRepo.insertIntent({
        tx: input.tx,
        phase: TxIntentPhase.DebitPending,

        action: TransactionAction.Debit,
        reason: TransactionReason.Bet,
        username: input.username,
        amount: input.amount,
        currency: input.currency,
        gameId: input.gameId,
        roundIds: input.roundIds,
        description: input.description,
        metadata: input.metadata,
        tenantId: input.tenantId,
        accountId: input.accountId,

        // recovery tracking
        recoveryAttempts: 0,
        lastRecoveryAt: null,
        recoveryError: null,
        resolvedAt: null,

        // timestamps
        createdAt: now,
        updatedAt: now,
      });
    } catch (walError) {
      logError(
        "DebitPlayerService.insertWal",
        walError instanceof Error ? walError : new Error(String(walError)),
        { ...input },
      );

      throw AppException.serviceUnavailable(
        "Hệ thống đang bận, không thể thực hiện giao dịch. Vui lòng thử lại.",
      );
    }
  }

  // ── Private: Gateway Resolution ───────────────────────────────────────────

  /**
   * Resolve tenant gateway client. Nếu tenant chưa setup callback → xoá WAL → throw.
   */
  private async resolveGateway(tx: string, tenantId: string): Promise<TenantGatewayClient> {
    const client = await tenantGateway.getClient(tenantId);

    if (!client) {
      await this.safeDeleteWal(tx);
      throw AppException.badRequest("Cấu hình đại lý chưa thiết lập. Không thể đặt cược.");
    }

    return client;
  }

  // ── Private: Tenant Debit Call ────────────────────────────────────────────

  /**
   * Gọi tenant debit API và xử lý response.
   *
   * Tenant-gateway dùng `rawResponse: true` — response giữ nguyên `CallbackResponse` envelope:
   * - `success: true` → đọc `data.balance`, return cho caller.
   * - `success: false` → business rejection (INSUFFICIENT_BALANCE, PLAYER_NOT_FOUND, WALLET_FROZEN...)
   *   → debit chắc chắn CHƯA apply → xoá WAL + throw `AppException.badRequest`.
   *
   * Lỗi HTTP/transport → HttpClient throw `ApiClientError`, xử lý theo status:
   * - 400 (invalid body), 401 (sai API key) → debit CHƯA apply → xoá WAL + throw badRequest.
   * - Mọi status khác (0, 408, 429, 500, 502–504) → không chắc debit đã apply
   *   → giữ WAL cho scheduler recovery.
   */
  private async callTenantDebit(
    input: DebitPlayerInput,
    client: TenantGatewayClient,
  ): Promise<DebitPlayerResult> {
    const { tx } = input;

    try {
      const txRequest: TransactionRequest = {
        action: TransactionAction.Debit,
        reason: TransactionReason.Bet,
        tx,
        // Chuyển sang username tenant đã đăng ký trên MegaWin.
        playerId: toTenantUsername(input.username),
        amount: input.amount,
        currency: input.currency,
        gameId: input.gameId,
        roundIds: input.roundIds,
        description: input.description,
        metadata: input.metadata,
      };

      // Gọi sang tenant debit API — response là CallbackResponse envelope (rawResponse).
      // Tenant có 2 kiểu fail:
      // 1. Business rejection — HTTP 200 + success:false (INSUFFICIENT_BALANCE, PLAYER_NOT_FOUND...):
      //    debit chắc chắn CHƯA apply → xoá WAL + throw badRequest (giống rejection 4xx).
      // 2. Transport / 5xx error — HttpClient throw ApiClientError, xử lý trong catch block.
      const response = await client.transaction(txRequest);

      if (!response.success) {
        await this.safeDeleteWal(tx);
        throw AppException.badRequest(
          response.error?.message ||
            "Không thể thực hiện giao dịch số dư tài khoản, hãy thử lại sau.",
        );
      }

      return { balance: response.data!.balance };
    } catch (error) {
     

      if (error instanceof ApiClientError && this.isTenantRejection(error)) {
        await this.safeDeleteWal(tx);
        throw AppException.badRequest(
          error.message || "Không thể thực hiện giao dịch số dư tài khoản, hãy thử lại sau.",
        );
      }

      logError(
        "DebitPlayerService.callTenantDebit",
        error instanceof Error ? error : new Error(String(error)),
        { ...input },
      );

      throw AppException.serviceUnavailable(
        "Không thể thực hiện giao dịch số dư tài khoản, hãy thử lại sau.",
      );
    }
  }

  /**
   * Tenant đã nhận request và reject rõ ràng ở tầng HTTP → debit chưa apply, xoá WAL an toàn.
   *
   * Theo callback contract, 2 HTTP status chỉ ra debit chắc chắn CHƯA xảy ra:
   * - 400 → body JSON invalid / thiếu field → tenant chưa vào business logic.
   * - 401 → sai API key → tenant chưa vào business logic.
   *
   * Business rejection (HTTP 200 + `success: false`, ví dụ INSUFFICIENT_BALANCE) KHÔNG đi qua
   * đây — HttpClient `rawResponse` giữ envelope, nhánh `!response.success` trong
   * `callTenantDebit` xử lý trực tiếp bằng `AppException.badRequest`.
   *
   * Mọi status khác (0, 408, 429, 500, 502–504) → không chắc debit đã apply
   * → giữ WAL cho scheduler recovery (check status → heal/rollback).
   */
  private isTenantRejection(error: ApiClientError): boolean {
    const s = error.status;
    return s === 400 || s === 401;
  }

  // ── Private: Cleanup ──────────────────────────────────────────────────────

  /**
   * Xoá WAL an toàn — swallow error nếu delete fail.
   * Dùng khi tenant reject debit (4xx) → WAL không cần thiết nữa.
   * Nếu delete fail, scheduler sẽ xử lý (confirm debit → failed → xoá).
   */
  private async safeDeleteWal(tx: string): Promise<void> {
    try {
      await this.txIntentRepo.deleteByTx(tx);
    } catch (deleteError) {
      logError(
        "DebitPlayerService.safeDeleteWal",
        deleteError instanceof Error ? deleteError : new Error(String(deleteError)),
        { tx },
      );
    }
  }
}
