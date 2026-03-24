/**
 * Game Core – Feed Sync Cursor
 *
 * Collection: feedSyncCursor
 *
 * Mỗi game worker sync entries vào entryFeed cần biết lần cuối
 * đã xử lý đến version nào. Document này persist cursor đó.
 *
 * Key = gameProduct (1 document per game).
 *
 * DISTRIBUTED LOCK:
 * Document cũng đóng vai trò distributed lock để ngăn 2 step function
 * executions chạy đồng thời cho cùng 1 game:
 *   - Scheduler acquireLock(): atomic set lockedUntil + lockedBy
 *   - SaveCursor releaseLock(): set lockedUntil = null
 *   - Lock auto-expire: nếu step function crash, lock hết hạn sau TTL
 */

import type { Long } from "mongodb";
import type { GameProduct } from "./game-core.enums";

/**
 * Application-layer entity cho feedSyncCursor document.
 *
 * Map từ FeedSyncCursorDoc:
 * - `_id` → `id` (string, ObjectId hex).
 * - `lastVersion` → `lastVersion` (string, Long.toString()) – safe cho JSON.
 */
export interface FeedSyncCursorEntity {
  /** ObjectId hex string, map từ _id. */
  id: string;

  /** GameProduct — unique key, mỗi game 1 document. */
  gameProduct: GameProduct;

  /**
   * Version cuối cùng đã sync thành công.
   * Đã convert từ BSON Long → string để an toàn khi serialize.
   */
  lastVersion: string;

  /** Thời điểm cập nhật cursor gần nhất (UTC). */
  updatedAt: Date;

  /**
   * Lock expiry time (UTC). Null = không ai giữ lock.
   * Scheduler set = now + TTL khi acquire. SaveCursor set = null khi release.
   */
  lockedUntil: Date | null;

  /**
   * ID của execution đang giữ lock.
   * Dùng cho debug/monitoring. SaveCursor verify trước khi release.
   */
  lockedBy: string | null;
}
