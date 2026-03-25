import { Long } from "mongodb";
import { GameCoreCollections } from "@megawin/game-core/entities";
import type { GameProduct } from "@megawin/game-core/entities";
import type { FeedSyncCursorEntity } from "@megawin/game-core/entities";
import { FeedSyncCursorMapper } from "../mappers/feed-sync-cursor-mapper";
import { GameCoreBaseRepo } from "./game-core-base-repo";
import type { AcquireLockResult } from "./types";

/** Lock TTL mặc định: 3 phút. Đủ cho 1 batch cycle hoàn tất; extend sau mỗi batch. */
const DEFAULT_LOCK_TTL_MS = 3 * 60 * 1000;

/**
 * Repository cho collection feedSyncCursor.
 *
 * Kết hợp 2 chức năng:
 * 1. Cursor tracking: lưu lastVersion đã sync.
 * 2. Distributed lock: ngăn concurrent Lambda executions.
 *
 * Lock pattern (Single Lambda, không còn Step Function):
 *   acquireLock → loop batches → saveAndExtendLock (mỗi batch) → releaseLock
 *   Nếu crash → lock auto-expire sau TTL (3 phút) → Lambda tiếp theo acquire lại.
 */
export class FeedSyncCursorRepository extends GameCoreBaseRepo<
  FeedSyncCursorEntity,
  FeedSyncCursorMapper
> {
  constructor() {
    super({
      collName: GameCoreCollections.FeedSyncCursor,
      dataMapper: new FeedSyncCursorMapper(),
    });
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
    lockTtlMs: number = DEFAULT_LOCK_TTL_MS,
  ): Promise<AcquireLockResult> {
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + lockTtlMs);

    const result = await this.findOneAndUpdate(
      {
        gameProduct,
        $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }],
      },
      {
        $set: { lockedUntil, updatedAt: now },
        $setOnInsert: { gameProduct, lastVersion: Long.fromNumber(0) },
      },
      { upsert: true, returnDocument: "after" },
    );

    if (!result) {
      return { acquired: false, afterVersion: "0" };
    }

    return {
      acquired: true,
      afterVersion: result.lastVersion,
    };
  }

  /**
   * Ghi lastVersion mới + release lock trong 1 atomic operation.
   *
   * Dùng khi step function kết thúc hoàn toàn (deprecated pattern).
   * Ưu tiên dùng `saveAndExtendLock` + `releaseLock` thay thế.
   *
   */
  async saveAndRelease(gameProduct: GameProduct, lastVersion: string): Promise<void> {
    const newVersion = Long.fromString(lastVersion);

    await this.findOneAndUpdate(
      { gameProduct },
      {
        $set: {
          lastVersion: newVersion,
          lockedUntil: null,
          updatedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  }

  /**
   * Ghi lastVersion mới + gia hạn lock (KHÔNG release).
   *
   * Gọi sau mỗi batch trong vòng sync loop. Đảm bảo:
   * - Cursor được persist ngay → crash chỉ mất tối đa 1 batch (500 entries)
   * - Lock được gia hạn thêm TTL → tránh lock expire giữa chừng khi đang chạy
   *
   */
  async saveAndExtendLock(
    gameProduct: GameProduct,
    lastVersion: string,
    lockTtlMs: number = DEFAULT_LOCK_TTL_MS,
  ): Promise<void> {
    const now = new Date();
    const newVersion = Long.fromString(lastVersion);
    const lockedUntil = new Date(now.getTime() + lockTtlMs);

    await this.findOneAndUpdate(
      { gameProduct },
      {
        $set: {
          lastVersion: newVersion,
          lockedUntil,
          updatedAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  }

  /**
   * Release lock (không thay đổi lastVersion).
   *
   * Gọi khi sync loop kết thúc (done = true hoặc timeout).
   * Cho phép Lambda tiếp theo acquire lock ngay lập tức
   * thay vì chờ lock tự expire.
   */
  async releaseLock(gameProduct: GameProduct): Promise<void> {
    await this.findOneAndUpdate(
      { gameProduct },
      {
        $set: {
          lockedUntil: null,
          updatedAt: new Date(),
        },
      },
      { upsert: false, returnDocument: "after" },
    );
  }
}
