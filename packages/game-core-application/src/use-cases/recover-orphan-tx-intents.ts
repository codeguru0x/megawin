/**
 * Use Case: Recover Orphan TxIntents (WAL Recovery)
 *
 * Chạy mỗi 2 phút bởi EventBridge scheduler. Scan collection `tx_intents`
 * tìm documents orphan (DEBIT_PENDING quá 30s) và xử lý.
 *
 * ## RECOVERY FLOW (per orphan intent):
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ Step 1: Increment recoveryAttempt                                  │
 * │         → Đánh dấu đã thử recovery, tránh liên tục retry          │
 * │                                                                     │
 * │ Step 2: Confirm Debit — READ-ONLY, không side effect               │
 * │   GET /megawin/callback/transaction/{tx}/status                    │
 * │   ├─ "success"   → debit ĐÃ xảy ra   → Step 3                    │
 * │   ├─ "failed"    → debit chưa xảy ra hoặc bị reject              │
 * │   │                → xoá WAL, done                                 │
 * │   └─ timeout/5xx → indeterminate      → retry lần sau             │
 * │                                                                     │
 * │ Step 3: Check Ticket Exists (game-specific service)                │
 * │   ticketExistsFn(gameId, tx)                                       │
 * │   ├─ exists    → crash SAU save, TRƯỚC markCompleted               │
 * │   │              → markCompleted (self-heal)                       │
 * │   └─ !exists   → crash SAU debit, TRƯỚC save                      │
 * │                  → rollback credit (hoàn tiền player)              │
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## TẠI SAO PHẢI CONFIRM DEBIT TRƯỚC KHI ROLLBACK?
 *
 * Ngăn **phantom credit** — scenario nguy hiểm:
 * 1. MegaWin gửi debit → timeout (network) → tenant CHƯA nhận/xử lý
 * 2. Recovery rollback → gửi credit → tenant cộng tiền cho player
 * 3. Kết quả: player nhận tiền miễn phí (debit không xảy ra, credit xảy ra)
 *
 * Với `checkTransactionStatus`:
 * - "failed" (NOT_FOUND) → debit chưa xảy ra → xoá WAL an toàn, KHÔNG gửi credit
 * - "success" → debit đã xảy ra → xử lý ticket check → credit nếu cần
 *
 * ## CONCURRENCY SAFE:
 *
 * Không dùng distributed lock. Mỗi intent xử lý atomic bằng
 * MongoDB updateOne với phase guard (phase must be DEBIT_PENDING).
 * 2 Lambda cùng handle 1 intent → chỉ 1 cái thành công update.
 *
 * ## IDEMPOTENT:
 *
 * Credit rollback dùng tx MỚI (UUIDv7) với metadata.refTx = tx gốc.
 * Tenant nhận cùng rollback tx 2+ lần → trả duplicate → MegaWin coi như OK.
 *
 * @see DebitPlayerService — hot path (place-bet) tạo WAL
 * @see TxIntentDoc — WAL document structure
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import type { TxIntentEntity } from "@megawin/game-core/entities";
import { TransactionAction, TransactionReason } from "@megawin/shared/types";
import { generateId, logError } from "@megawin/shared/utils";
import type { TransactionStatusResponse } from "@megawin/tenant-gateway";
import { tenantGateway } from "@megawin/tenant-gateway";

import { TxIntentRepository } from "../infras/repos/tx-intent-repo";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Callback function kiểm tra ticket tồn tại theo game.
 *
 * Worker inject function này khi khởi tạo use case.
 * Map gameId → game-specific TicketLookupService.existsByTx().
 *
 * @param gameId - Mã sản phẩm game (VD: "keno", "mega645")
 * @param tx - Transaction ID (UUIDv7) gắn trong ticketDoc.tx
 * @returns true nếu ticket với tx đó đã được save
 */
export type TicketExistsFn = (gameId: string, tx: string) => Promise<boolean>;

export interface RecoverOrphanTxIntentsResult {
  /** Tổng orphans tìm được (bao gồm exhausted). */
  found: number;
  /** Số intents đã rollback thành công (credit tenant OK). */
  rolledBack: number;
  /** Số intents đã complete (ticket tồn tại, self-heal). */
  completed: number;
  /** Số intents chuyển sang MANUAL_REVIEW (exhausted). */
  escalated: number;
  /** Số intents WAL xoá (debit chưa xảy ra — not_found/failed). */
  deleted: number;
  /** Số intents recovery fail (sẽ retry lần sau). */
  failed: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Use Case
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recovery Lambda use case — xử lý orphan tx_intents.
 *
 * Constructor nhận `ticketExistsFn` từ worker handler.
 * Worker xây map: gameId → TicketLookupService → inject vào đây.
 *
 * @example
 * ```ts
 * const useCase = new RecoverOrphanTxIntentsUseCase(
 *   async (gameId, tx) => {
 *     const checker = ticketCheckers[gameId];
 *     return checker ? checker.existsByTx(tx) : false;
 *   },
 * );
 * await useCase.run();
 * ```
 */
export class RecoverOrphanTxIntentsUseCase extends InternalUseCase<void, RecoverOrphanTxIntentsResult> {
  private readonly txIntentRepo = new TxIntentRepository();
  private readonly ticketExistsFn: TicketExistsFn;

  /**
   * @param ticketExistsFn - Callback kiểm tra ticket tồn tại.
   *   Worker inject từ game-specific TicketLookupService.
   *   Nếu không có checker cho gameId → return false → rollback.
   */
  constructor(ticketExistsFn: TicketExistsFn) {
    super();
    this.ticketExistsFn = ticketExistsFn;
  }

  protected async execute(): Promise<RecoverOrphanTxIntentsResult> {
    const result: RecoverOrphanTxIntentsResult = {
      found: 0,
      rolledBack: 0,
      completed: 0,
      escalated: 0,
      deleted: 0,
      failed: 0,
    };

    // ── Bước 1: Escalate exhausted intents (>= 20 attempts) ──────────
    // Intents đã retry quá nhiều lần → cần human investigation.
    // Ghi resolvedAt → TTL 14 ngày bắt đầu đếm.
    const exhausted = await this.txIntentRepo.findExhaustedOrphans(50);
    for (const intent of exhausted) {
      await this.txIntentRepo.markManualReview(
        intent.tx,
        `Recovery exhausted after ${intent.recoveryAttempts} attempts. Last error: ${intent.recoveryError ?? "unknown"}`,
      );
      result.escalated++;
      console.error(
        `[recover-tx-intents] MANUAL_REVIEW: tx=${intent.tx} game=${intent.gameId} attempts=${intent.recoveryAttempts}`,
      );
    }

    // ── Bước 2: Recover orphans (< 20 attempts, > 30s old) ──────────
    const orphans = await this.txIntentRepo.findOrphans(50);
    result.found = orphans.length + exhausted.length;

    for (const intent of orphans) {
      try {
        await this.recoverOne(intent, result);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[recover-tx-intents] Failed to recover tx=${intent.tx}: ${errMsg}`);
        await this.txIntentRepo.incrementRecoveryAttempt(intent.tx, errMsg);
        result.failed++;
      }
    }

    if (result.found > 0) {
      console.log(
        `[recover-tx-intents] Summary: found=${result.found} rolledBack=${result.rolledBack} ` +
          `completed=${result.completed} deleted=${result.deleted} escalated=${result.escalated} failed=${result.failed}`,
      );
    }

    return result;
  }

  /**
   * Xử lý 1 orphan intent theo 3-step flow.
   *
   * Step 1: Increment recovery attempt counter.
   * Step 2: Confirm debit via checkTransactionStatus (read-only).
   * Step 3: Check ticket exists → markCompleted hoặc rollback credit.
   */
  private async recoverOne(intent: TxIntentEntity, result: RecoverOrphanTxIntentsResult): Promise<void> {
    // ── Step 1: Đánh dấu đã thử recovery ──
    await this.txIntentRepo.incrementRecoveryAttempt(intent.tx);

    // ── Step 2: Confirm debit status tại tenant (READ-ONLY) ──
    // Đây là bước quan trọng nhất — ngăn phantom credit.
    const gateway = await tenantGateway.getClient(intent.tenantId);

    if (!gateway) {
      // Tenant chưa setup callback → debit chưa bao giờ xảy ra → xoá WAL.
      console.warn(
        `[recover-tx-intents] Tenant ${intent.tenantId} no gateway config. ` +
          `Deleting WAL tx=${intent.tx} (DRY-RUN).`,
      );
      await this.txIntentRepo.deleteByTx(intent.tx);
      result.deleted++;
      return;
    }

    let statusResponse: TransactionStatusResponse;
    try {
      statusResponse = await gateway.checkTransactionStatus(intent.tx);
    } catch (err: unknown) {
      // Timeout / 5xx / network error → indeterminate.
      // Không biết tenant đã xử lý debit chưa → KHÔNG hành động → retry lần sau.
      const errMsg = err instanceof Error ? err.message : String(err);
      logError("recover-tx-intents.checkStatus", new Error(errMsg), {
        tx: intent.tx,
        tenantId: intent.tenantId,
      });
      await this.txIntentRepo.incrementRecoveryAttempt(intent.tx, `checkTransactionStatus error: ${errMsg}`);
      result.failed++;
      return;
    }

    // ── Xử lý theo debit status (CallbackResponse envelope: success boolean) ──
    // success: false → debit CHƯA xảy ra (NOT_FOUND) hoặc bị reject → xoá WAL.
    // success: true → debit đã xảy ra → check ticket → rollback hoặc self-heal.
    if (!statusResponse.success) {
      // Debit CHƯA xảy ra (NOT_FOUND) hoặc bị reject → xoá WAL, không cần rollback credit.
      // An toàn vì tenant chưa trừ tiền player.
      await this.txIntentRepo.deleteByTx(intent.tx);
      result.deleted++;
      const errorCode = statusResponse.error?.code ?? "unknown";
      console.log(`[recover-tx-intents] Debit failed (${errorCode}) → deleted WAL tx=${intent.tx}`);
      return;
    }

    // ── Step 3: Debit đã xảy ra (success) → Check ticket exists ──
    // 2 trường hợp:
    // A) Ticket exists → crash xảy ra SAU save nhưng TRƯỚC markCompleted → self-heal.
    // B) Ticket NOT exists → crash xảy ra SAU debit nhưng TRƯỚC save → rollback credit.
    const ticketExists = await this.ticketExistsFn(intent.gameId, intent.tx);

    if (ticketExists) {
      // Case A: Ticket saved nhưng WAL chưa completed → self-heal.
      await this.txIntentRepo.markCompleted(intent.tx);
      result.completed++;
      console.log(`[recover-tx-intents] Ticket exists → markCompleted tx=${intent.tx} game=${intent.gameId}`);
    } else {
      // Case B: Debit OK nhưng ticket không tồn tại → rollback credit.
      await this.rollbackCredit(intent, result);
    }
  }

  /**
   * Gửi credit rollback cho tenant để hoàn tiền player.
   *
   * Sinh tx MỚI cho rollback transaction (idempotent). refTx (tx gốc debit)
   * nằm trong metadata — informational only, tenant không cần validate.
   *
   * Nếu credit OK → markRolledBack. Nếu credit fail → increment attempt, retry sau.
   */
  private async rollbackCredit(intent: TxIntentEntity, result: RecoverOrphanTxIntentsResult): Promise<void> {
    const gateway = await tenantGateway.getClient(intent.tenantId);

    if (!gateway) {
      // Edge case: gateway biến mất giữa chừng → escalate, không rollback mù.
      await this.txIntentRepo.incrementRecoveryAttempt(intent.tx, "Gateway unavailable during rollback");
      result.failed++;
      return;
    }

    const rollbackTx = generateId();
    const response = await gateway.transaction({
      action: TransactionAction.Credit,
      reason: TransactionReason.Rollback,
      tx: rollbackTx,
      playerId: intent.username,
      amount: intent.amount,
      currency: intent.currency,
      gameId: intent.gameId,
      roundIds: intent.roundIds,
      description: `Rollback ${intent.reason} ${intent.gameId} – WAL recovery`,
      metadata: {
        ...intent.metadata,
        refTx: intent.tx,
        recoveryReason: "debit_confirmed_no_ticket",
      },
    });

    // success: true bao gồm cả duplicate (data.duplicate === true).
    // Rollback OK → markRolledBack, dù duplicate hay lần đầu đều coi như rollback xong.
    if (response.success) {
      await this.txIntentRepo.markRolledBack(intent.tx);
      result.rolledBack++;
      console.log(`[recover-tx-intents] Rolled back tx=${intent.tx} via rollbackTx=${rollbackTx}`);
    } else {
      // success: false → rollback credit bị reject (rare — ví bị khoá, player bị xoá).
      const errMsg = response.error?.message ?? "unknown error";
      await this.txIntentRepo.incrementRecoveryAttempt(intent.tx, `rollback failed: ${errMsg}`);
      result.failed++;
      console.error(`[recover-tx-intents] Rollback failed tx=${intent.tx}: ${errMsg}`);
    }
  }
}
