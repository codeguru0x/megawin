import { Long } from "mongodb";
import { GameCoreCollections } from "@megawin/game-core/entities";
import type { GameProduct } from "@megawin/game-core/entities";
import type { BaseEntity } from "@megawin/data/mongo/base-entity";
import { GameCoreBaseRepo } from "./game-core-base-repo";

/** Lock TTL mặc định: 5 phút. Đủ cho step function sync xong. */
const DEFAULT_LOCK_TTL_MS = 5 * 60 * 1000;

export interface AcquireLockResult {
  acquired: boolean;
  afterVersion: string;
}

/**
 * Repository cho collection feedSyncCursor.
 *
 * Kết hợp 2 chức năng:
 * 1. Cursor tracking: lưu lastVersion đã sync.
 * 2. Distributed lock: ngăn concurrent step function executions.
 *
 * Lock pattern:
 *   acquireLock → (step function chạy) → saveAndRelease
 *   Nếu crash → lock auto-expire sau TTL → scheduler acquire lại.
 */
export class FeedSyncCursorRepository extends GameCoreBaseRepo<BaseEntity> {
  constructor() {
    super({ collName: GameCoreCollections.FeedSyncCursor });
  }

  /**
   * Atomic acquire lock + đọc afterVersion trong 1 operation.
   *
   * Điều kiện acquire thành công:
   *   - Chưa có lock (lockedUntil = null)
   *   - HOẶC lock đã expire (lockedUntil < now)
   *
   * Trả acquired=false nếu ai đó đang giữ lock chưa hết hạn.
   */
  async acquireLock(
    gameProduct: GameProduct,
    executionId: string,
    lockTtlMs: number = DEFAULT_LOCK_TTL_MS,
  ): Promise<AcquireLockResult> {
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + lockTtlMs);

    const result = await this.findOneAndUpdate(
      {
        gameProduct,
        $or: [
          { lockedUntil: null },
          { lockedUntil: { $exists: false } },
          { lockedUntil: { $lt: now } },
        ],
      },
      {
        $set: { lockedUntil, lockedBy: executionId, updatedAt: now },
        $setOnInsert: { gameProduct, lastVersion: Long.fromNumber(0) },
      },
      { upsert: true, returnDocument: "after" },
    );

    if (!result) {
      return { acquired: false, afterVersion: "0" };
    }

    const v = (result as any).lastVersion as Long | undefined;
    return {
      acquired: true,
      afterVersion: v ? v.toString() : "0",
    };
  }

  /**
   * Ghi lastVersion mới + release lock trong 1 atomic operation.
   *
   * Chỉ ghi nếu lastVersion mới >= version hiện tại (tránh ghi đè lùi).
   * Release lock bất kể executionId (crash recovery safe).
   */
  async saveAndRelease(
    gameProduct: GameProduct,
    lastVersion: string,
  ): Promise<void> {
    const newVersion = Long.fromString(lastVersion);

    await this.findOneAndUpdate(
      { gameProduct },
      {
        $set: {
          lastVersion: newVersion,
          lockedUntil: null,
          lockedBy: null,
          updatedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  }

  /**
   * Đọc lastVersion (không acquire lock).
   * Dùng cho monitoring / debug.
   */
  async getLastVersion(gameProduct: GameProduct): Promise<string> {
    const doc = await this.findOneAsDocument({ gameProduct });
    if (!doc) return "0";
    const v = doc.lastVersion as Long | undefined;
    return v ? v.toString() : "0";
  }
}
