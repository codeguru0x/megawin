import type { TxIntentEntity } from "@megawin/game-core/entities";
import { TxIntentPhase } from "@megawin/game-core/entities";

import { TxIntentMapper } from "../mappers/tx-intent-mapper";
import { MegawinTenantCoreBaseRepo } from "./game-core-base-repo";

/**
 * Ngưỡng thời gian (ms) xác định intent là orphan.
 * Intent tạo trước `Date.now() - ORPHAN_THRESHOLD_MS` và vẫn ở phase
 * DEBIT_PENDING được coi là orphan cần recovery.
 */
const ORPHAN_THRESHOLD_MS = 30_000;

/** Số recovery tối đa trước khi chuyển sang MANUAL_REVIEW. */
const MAX_RECOVERY_ATTEMPTS = 20;

/**
 * Repository cho collection `tx_intents` — Write-Ahead Log (WAL).
 *
 * Ghi intent TRƯỚC khi gọi tenant debit API, đảm bảo recovery nếu Lambda crash.
 * Database: megawin-tenant (MegawinTenantCoreBaseRepo) — cùng DB với tenant config
 * và transaction logs, tách biệt khỏi game data (megawin).
 *
 * STATE MACHINE (4 phases):
 *   DEBIT_PENDING → COMPLETED       (happy path: debit → save → markCompleted)
 *   DEBIT_PENDING → (delete)        (inline: debit fail 4xx)
 *   DEBIT_PENDING → ROLLED_BACK     (scheduler: confirm debit → rollback credit)
 *   DEBIT_PENDING → MANUAL_REVIEW   (scheduler: exhausted ≥ 20 attempts)
 *
 * Indexes:
 *   - `{ tx: 1 }` unique — ngăn duplicate WAL record
 *   - `{ phase: 1, createdAt: 1 }` — recovery query orphans
 *   - `{ tenantId: 1, gameId: 1, createdAt: -1 }` — reporting
 *   - TTL index trên `resolvedAt` (14 ngày) — auto-cleanup resolved intents
 */
export class TxIntentRepository extends MegawinTenantCoreBaseRepo<TxIntentEntity, TxIntentMapper> {
  constructor() {
    super({
      collName: "tx_intents",
      dataMapper: new TxIntentMapper(),
    });
  }

  // ── Happy Path Operations ──────────────────────────────────────────────

  /**
   * Insert WAL record trước khi gọi tenant debit.
   *
   * Phase bắt đầu là DEBIT_PENDING. Nếu tx đã tồn tại (unique index)
   * → MongoDB throw duplicate key error → caller xử lý retry logic.
   *
   * @returns ObjectId hex string của document mới.
   */
  async insertIntent(doc: Omit<TxIntentEntity, "id">): Promise<string> {
    return await this.insertOne(doc);
  }

  /**
   * Ticket + entries saved thành công → flow hoàn tất.
   *
   * Guard: chỉ accept phase DEBIT_PENDING. Sau khi debit OK → game save ticket
   * → gọi markCompleted. Không có trạng thái trung gian DebitOk.
   *
   * Ghi resolvedAt để TTL bắt đầu đếm 14 ngày.
   */
  async markCompleted(tx: string): Promise<boolean> {
    const now = new Date();
    return await this.updateOne(
      { tx, phase: TxIntentPhase.DebitPending },
      {
        $set: {
          phase: TxIntentPhase.Completed,
          updatedAt: now,
          resolvedAt: now,
        },
      },
    );
  }

  /**
   * Rollback credit thành công → intent resolved.
   * Guard: chỉ accept DEBIT_PENDING (không còn DEBIT_OK).
   * Ghi resolvedAt để TTL bắt đầu đếm.
   */
  async markRolledBack(tx: string): Promise<boolean> {
    const now = new Date();
    return await this.updateOne(
      {
        tx,
        phase: TxIntentPhase.DebitPending,
      },
      {
        $set: {
          phase: TxIntentPhase.RolledBack,
          updatedAt: now,
          resolvedAt: now,
        },
      },
    );
  }

  /**
   * Recovery fail quá nhiều lần → cần operator kiểm tra.
   * Ghi resolvedAt để TTL bắt đầu đếm (alert đã gửi).
   */
  async markManualReview(tx: string, error: string): Promise<boolean> {
    const now = new Date();
    return await this.updateOne(
      { tx },
      {
        $set: {
          phase: TxIntentPhase.ManualReview,
          recoveryError: error,
          updatedAt: now,
          resolvedAt: now,
        },
      },
    );
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  /**
   * Xoá intent bằng tx key.
   *
   * Dùng khi inline handler biết chắc debit FAIL (4xx) — intent không cần
   * recovery, xoá luôn để giảm noise cho recovery job.
   */
  async deleteByTx(tx: string): Promise<boolean> {
    return await this.deleteOne({ tx });
  }

  // ── Recovery ───────────────────────────────────────────────────────────

  /**
   * Tìm orphan intents cần recovery.
   *
   * Điều kiện:
   *   - phase = DEBIT_PENDING
   *   - createdAt < now - ORPHAN_THRESHOLD_MS (tức đã chờ > 30s)
   *   - recoveryAttempts < MAX_RECOVERY_ATTEMPTS
   *
   * Trả về tối đa `limit` intents, sắp xếp theo createdAt cũ nhất trước.
   */
  async findOrphans(limit = 50): Promise<TxIntentEntity[]> {
    const cutoff = new Date(Date.now() - ORPHAN_THRESHOLD_MS);

    return await this.findMany(
      {
        phase: TxIntentPhase.DebitPending,
        createdAt: { $lt: cutoff },
        recoveryAttempts: { $lt: MAX_RECOVERY_ATTEMPTS },
      },
      {
        sort: { createdAt: 1 },
        limit,
      },
    );
  }

  /**
   * Tìm orphan intents đã vượt ngưỡng recovery → cần MANUAL_REVIEW.
   */
  async findExhaustedOrphans(limit = 50): Promise<TxIntentEntity[]> {
    return await this.findMany(
      {
        phase: TxIntentPhase.DebitPending,
        recoveryAttempts: { $gte: MAX_RECOVERY_ATTEMPTS },
      },
      {
        sort: { createdAt: 1 },
        limit,
      },
    );
  }

  /**
   * Tăng recoveryAttempts + ghi lastRecoveryAt cho intent.
   * Gọi ĐẦU mỗi recovery attempt. Nếu fail thì ghi recoveryError kèm.
   */
  async incrementRecoveryAttempt(tx: string, error?: string): Promise<boolean> {
    const now = new Date();
    return await this.updateOne(
      { tx },
      {
        $inc: { recoveryAttempts: 1 },
        $set: {
          lastRecoveryAt: now,
          updatedAt: now,
          ...(error != null ? { recoveryError: error } : {}),
        },
      },
    );
  }
}
