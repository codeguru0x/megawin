/**
 * Game Core – Feed Sync Cursor
 *
 * Collection: feedSyncCursor
 *
 * Mỗi game worker sync entries vào entryFeed cần biết lần cuối
 * đã xử lý đến version nào. Document này persist cursor đó.
 *
 * Key = gameProduct (1 document per game).
 * Worker đọc cursor trước khi chạy, ghi lại sau khi sync xong.
 */

import type { Long } from "mongodb";
import type { GameProduct } from "./game-core.enums";

export interface FeedSyncCursorDoc {
  _id: unknown;

  /** GameProduct — unique key, mỗi game 1 document. */
  gameProduct: GameProduct;

  /**
   * Version cuối cùng đã sync thành công (BSON Long).
   * Worker dùng giá trị này làm afterVersion cho lần chạy tiếp.
   * Mặc định Long(0) khi chưa có.
   */
  lastVersion: Long;

  /** Thời điểm cập nhật cursor gần nhất (UTC). */
  updatedAt: Date;
}
