/**
 * Mega 6/45 – Draw Account Stats (tích luỹ cược theo account trong 1 kỳ)
 *
 * Collection: mega645_draw_account_stats — 1 document / (draw × account).
 *
 * Port từ Power 6/55 (`packages/game-power655/src/entities/account-stats.ts`).
 *
 * Nguồn cho `topAccounts` (sort `amount` desc limit K), drill-down alert `large_bet`.
 *
 * ## Retention
 *
 * TTL index `{ createdAt: 1 }, expireAfterSeconds` 90 ngày (khai trong
 * `MEGA645_INDEXES`). KHÔNG cleanup batch trong app.
 */

import type { DeltaAccumulatedDoc } from "@megawin/game-core/types";

/**
 * Tích luỹ cược của 1 account trong 1 kỳ.
 *
 * Mọi field số đều cộng dồn bằng `$inc` — KHÔNG bao giờ `$set` (tránh lost-update
 * và loại bỏ nhu cầu đọc baseline trước khi ghi). Idempotent nhờ watermark per-doc,
 * xem {@link DeltaAccumulatedDoc}.
 */
export interface Mega645DrawAccountStatsDoc extends DeltaAccumulatedDoc {
  /** MongoDB ObjectId. */
  _id: unknown;
  /** drawId dạng `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** ID account. Unique cùng `drawId`. */
  accountId: string;
  /**
   * Username snapshot mới nhất thấy trong entry (ưu tiên hiển thị trước `accountId`).
   *
   * Đây là field DUY NHẤT dùng `$set` (ghi đè bằng giá trị mới nhất) — các field số
   * dùng `$inc`. Rỗng `""` khi entry không có username snapshot → UI fallback về `accountId`.
   */
  username: string;
  /** Tổng tiền cược của account trong kỳ (VND). */
  amount: number;
  /** Số entry của account trong kỳ. */
  entries: number;
  /** Tổng số bộ cược `Σ(board.expandedLines × betCount)` của account trong kỳ (KHÔNG phải số board). */
  sets: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface Mega645DrawAccountStatsEntity extends Omit<Mega645DrawAccountStatsDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
