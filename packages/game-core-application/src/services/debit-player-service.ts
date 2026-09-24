/**
 * DebitPlayerService — Shared service xử lý WAL + tenant debit cho place-bet.
 *
 * Encapsulate toàn bộ lifecycle:
 *   1. deriveTx(accountId, idempotencyKey) — cùng input → cùng `tx`, caller dùng gán ticketDoc.tx
 *   2. debit(input) — insert WAL + gọi tenant debit
 *   3. markCompleted(tx) — sau khi save ticket thành công
 *
 * ## FLOW CHI TIẾT (hot path — place-bet):
 *
 * ```
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ Caller (place-bet use case)                                     │
 * │                                                                  │
 * │  const tx = debitService.deriveTx(accountId, idempotencyKey);   │
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

import { isDuplicateKeyError } from "@megawin/data/mongo";
import { TxIntentPhase, type TxIntentEntity } from "@megawin/game-core/entities";
import { ApiClientError } from "@megawin/shared/api-types";
import { APP_ERROR_CODES, AppException } from "@megawin/shared/errors";
import { TransactionAction, TransactionReason, type Currency } from "@megawin/shared/types";
import { logError, toTenantUsername } from "@megawin/shared/utils";
import {
  tenantGateway,
  TxLoggingPolicy,
  type TenantGatewayClient,
  type TransactionRequest,
} from "@megawin/tenant-gateway";

import { TxIntentRepository } from "../infras/repos/tx-intent-repo";
import { deriveTx } from "./derive-tx";

// ─────────────────────────────────────────────────────────────────────────────
// Input / Output
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input cho debit operation — generic, không phụ thuộc game cụ thể.
 *
 * Mọi trường mirror TransactionRequest + internal ownership fields.
 * Khi thêm game mới, KHÔNG cần sửa interface này — chỉ truyền đúng giá trị.
 *
 * **Caller dùng `debitService.deriveTx(accountId, idempotencyKey)` để tạo `tx` TRƯỚC khi build ticketDoc.**
 */
export interface DebitPlayerInput {
  /**
   * Transaction ID (UUIDv5, cùng input → cùng `tx`) — idempotency key, unique per bet.
   * Caller derive bằng `debitService.deriveTx(accountId, idempotencyKey)` TRƯỚC khi build ticketDoc.
   * @example "3f8a1c2e-6b4d-5a91-9e07-2d5c8f1a3b6e"
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
 * Không trả `tx` vì caller đã derive và truyền vào `DebitPlayerInput.tx`.
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
 * const tx = debitService.deriveTx(accountId, idempotencyKey);
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
   * Dẫn xuất `tx` từ idempotency key của client — cùng input luôn cho cùng `tx`.
   *
   * Nhờ đó request trùng đập vào unique index `{tx}` của `tx_intents` và bị phát hiện,
   * thay vì tạo giao dịch thứ hai. Dùng UUIDv5 (namespace + name) để kết quả vẫn là
   * UUID hợp lệ — tenant validate format `tx` không bị ảnh hưởng.
   *
   * ⚠️ CÔNG THỨC LÀ CONTRACT: đổi namespace, đổi thứ tự field, hay đổi cách chuẩn hoá
   * sẽ làm MỌI key đã phát hành mất tính idempotent. Có unit test vector cố định canh việc này.
   */
  deriveTx(accountId: string, idempotencyKey: string): string {
    return deriveTx(accountId, idempotencyKey);
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

    return await this.invokeTenantDebit(input, client, { deleteWalOnReject: true });
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

  /**
   * Đọc WAL theo `tx` — dùng sau khi insert đụng unique `{tx}`.
   */
  async findWal(tx: string): Promise<TxIntentEntity | null> {
    return await this.txIntentRepo.findByTx(tx);
  }

  /**
   * Replay khi `debit()` báo `IDEMPOTENCY_CONFLICT` (insert WAL đụng unique `{tx}`).
   *
   * MỤC ĐÍCH: client giữ nguyên `idempotencyKey` khi retry (timeout, mất mạng) — nghĩa
   * là cùng một `tx` gọi đến lần 2. Request thứ 2 **không được** tạo giao dịch debit
   * mới; phải trả lại đúng kết quả của request đầu. Đây là nơi DUY NHẤT quyết định
   * "được trả kết quả cũ" hay "phải báo lỗi" — gộp 2 việc trước đây tách rời
   * (`resolveIdempotencyConflict` đọc phase + `replayDebit` gọi tenant) thành một lần
   * gọi duy nhất cho caller, vì chúng luôn được gọi cùng nhau trên đúng 1 nhánh.
   *
   * LOGIC — đọc phase của WAL (`tx_intents`) do request đầu ghi lại, rồi phân nhánh:
   *
   * | Phase WAL của request đầu | Ý nghĩa | Hành động ở đây |
   * |---|---|---|
   * | `COMPLETED` | Debit + tạo vé đã xong | Gọi lại tenant **cùng `tx`** → tenant trả `duplicate: true` + số dư **hiện tại** (không dùng số dư cũ lưu sẵn — player có thể đã nạp/rút giữa 2 lần gọi) |
   * | `DEBIT_PENDING` | Đang xử lý (double-tap / race `Promise.all`) | `409` — bảo client **chờ và gửi lại CÙNG key**, không phải đổi key |
   * | `ROLLED_BACK` / `MANUAL_REVIEW` | Đã bị hoàn tiền / đang chờ soát thủ công | `409` — request đầu coi như chết, client phải dùng key **MỚI** cho ý định cược mới |
   * | WAL không còn (bị xoá do race) | Không rõ trạng thái | `409` — an toàn nhất là không tự tạo giao dịch mới |
   *
   * Chỉ nhánh `COMPLETED` mới đi tiếp gọi tenant; 3 nhánh còn lại throw ngay, không
   * chạm network.
   *
   * ⚠️ Gọi `invokeTenantDebit` với `deleteWalOnReject: false` — WAL `COMPLETED` không được xoá.
   *
   * @throws {@link AppException} `IDEMPOTENCY_CONFLICT` (409) cho mọi phase khác `COMPLETED`.
   */
  async replayCompletedDebit(input: DebitPlayerInput): Promise<DebitPlayerResult> {
    const wal = await this.txIntentRepo.findByTx(input.tx);

    if (!wal) {
      throw new AppException(
        APP_ERROR_CODES.IDEMPOTENCY_CONFLICT,
        "Giao dịch trước không còn hiệu lực, vui lòng dùng thực hiện lại.",
      );
    }

    switch (wal.phase) {
      case TxIntentPhase.DebitPending:
        throw new AppException(
          APP_ERROR_CODES.IDEMPOTENCY_CONFLICT,
          "Yêu cầu đang được xử lý, vui lòng chờ và thử lại.",
        );
      case TxIntentPhase.RolledBack:
      case TxIntentPhase.ManualReview:
        throw new AppException(
          APP_ERROR_CODES.IDEMPOTENCY_CONFLICT,
          "Giao dịch trước đã bị hoàn hoặc đang được kiểm tra, vui lòng thực hiện lại.",
        );
      case TxIntentPhase.Completed:
        break; // tiếp tục gọi tenant lấy số dư tươi
    }

    const client = await tenantGateway.getClient(input.tenantId);
    if (!client) {
      // Replay: WAL đã COMPLETED + vé đã tồn tại — không xoá WAL khi tenant chưa setup.
      throw AppException.badRequest("Cấu hình đại lý chưa thiết lập. Không thể đặt cược.");
    }

    return await this.invokeTenantDebit(input, client, { deleteWalOnReject: false });
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
      // Unique `{tx}` — request trùng key. Phân biệt bằng code Mongo 11000, không theo message.
      // Caller đọc WAL phase: COMPLETED → replay; DEBIT_PENDING / khác → 409.
      if (isDuplicateKeyError(walError)) {
        throw new AppException(
          APP_ERROR_CODES.IDEMPOTENCY_CONFLICT,
          "Yêu cầu đang được xử lý, vui lòng chờ và thử lại.",
        );
      }

      logError("DebitPlayerService.insertWal", walError instanceof Error ? walError : new Error(String(walError)), {
        ...input,
      });

      throw AppException.serviceUnavailable("Hệ thống đang bận, không thể thực hiện giao dịch. Vui lòng thử lại.");
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
   * Gọi tenant debit — một chỗ map lỗi tenant.
   *
   * `deleteWalOnReject`:
   * - `true`  — lần 1 (`debit`): tenant reject / HTTP 400–401 → debit chưa apply → xoá WAL.
   * - `false` — replay: WAL đã COMPLETED + vé đã có → **cấm** xoá.
   *
   * Timeout / 5xx không xoá WAL (dù flag nào) — scheduler recovery.
   */
  private async invokeTenantDebit(
    input: DebitPlayerInput,
    client: TenantGatewayClient,
    options: { deleteWalOnReject: boolean },
  ): Promise<DebitPlayerResult> {
    const { deleteWalOnReject } = options;

    const txRequest: TransactionRequest = {
      action: TransactionAction.Debit,
      reason: TransactionReason.Bet,
      tx: input.tx,
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
      //
      // logging: TxLoggingPolicy.OnSuccessOrUncertain — align với safeDeleteWal lifecycle.
      // - Skip log khi tenant business reject / HTTP 400 / 401 → WAL bị xoá,
      //   không có gì để reconcile → log không có giá trị, chỉ flood khi
      //   player spam retry với `INSUFFICIENT_BALANCE`.
      // - Vẫn log khi success (audit) và uncertainty (timeout/5xx/network) —
      //   đúng lúc WAL được giữ cho scheduler recovery + forensic.
    try {
      const response = await client.transaction(txRequest, {
        logging: TxLoggingPolicy.OnSuccessOrUncertain,
      });

      if (!response.success) {
        await this.rejectTenantDebit(
          input.tx,
          response.error?.message || "Không thể thực hiện giao dịch số dư tài khoản, hãy thử lại sau.",
          deleteWalOnReject,
        );
      }

      return { balance: response.data?.balance ?? 0 };
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }

      if (error instanceof ApiClientError && this.isTenantRejection(error)) {
        await this.rejectTenantDebit(
          input.tx,
          error.message || "Không thể thực hiện giao dịch số dư tài khoản, hãy thử lại sau.",
          deleteWalOnReject,
        );
      }

      logError("DebitPlayerService.invokeTenantDebit", error instanceof Error ? error : new Error(String(error)), {
        ...input,
      });

      throw AppException.serviceUnavailable("Không thể thực hiện giao dịch số dư tài khoản, hãy thử lại sau.");
    }
  }

  /**
   * Tenant reject rõ (debit chưa apply). Xoá WAL chỉ khi `deleteWalOnReject`.
   *
   * @returns never — luôn throw sau khi (tuỳ chọn) xoá WAL.
   */
  private async rejectTenantDebit(tx: string, message: string, deleteWalOnReject: boolean): Promise<never> {
    if (deleteWalOnReject) {
      await this.safeDeleteWal(tx);
    }
    throw AppException.badRequest(message);
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
   * `invokeTenantDebit` xử lý trực tiếp bằng `AppException.badRequest`.
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
