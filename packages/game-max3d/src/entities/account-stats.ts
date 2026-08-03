/**
 * Max 3D – Draw Account Stats (tích luỹ cược theo account trong 1 kỳ)
 *
 * Collection: max3d_draw_account_stats — 1 document / (draw × account).
 *
 * ## Vì sao cần collection riêng thay vì mảng `topAccounts` trong stats doc?
 *
 * `topAccounts` là top-K theo metric **TÍCH LUỸ** (`amount` cộng dồn). Trước p0-03 nó là
 * field `@deprecated` chưa từng được port sang collection phụ — nuôi mảng top-K trong stats
 * doc buộc seed lại mỗi tick → account rơi khỏi top-K **mất toàn bộ lịch sử**, lần cược sau
 * tính lại từ 0 → tổng hụt, xếp hạng sai, sai số tỷ lệ thuận số người chơi.
 *
 * Sửa gốc (giống Keno `KenoDrawAccountStatsDoc`): mọi account đều có doc riêng, ghi bằng
 * `$inc` upsert (không RMW, idempotent theo watermark). `topAccounts` derive bằng
 * `sort({amount:-1}).limit(K)` trên index → **chính xác tuyệt đối**, không phụ thuộc K.
 *
 * ## Retention
 *
 * TTL index `{ createdAt: 1 }, expireAfterSeconds` 90 ngày (tạo thủ công theo
 * `MAX3D_INDEXES`). KHÔNG cleanup batch trong app.
 */

import type { DeltaAccumulatedDoc } from "@megawin/game-core/types";

/**
 * Tích luỹ cược của 1 account trong 1 kỳ.
 *
 * Mọi field số đều cộng dồn bằng `$inc` — KHÔNG bao giờ `$set` (tránh lost-update và
 * loại bỏ nhu cầu đọc baseline trước khi ghi). Idempotent nhờ watermark per-doc, xem
 * {@link DeltaAccumulatedDoc}.
 */
export interface Max3dDrawAccountStatsDoc extends DeltaAccumulatedDoc {
  /** MongoDB ObjectId. */
  _id: unknown;
  /** drawId dạng `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** ID account. Unique cùng `drawId`. */
  accountId: string;
  /**
   * Username snapshot mới nhất thấy trong entry (ưu tiên hiển thị trước `accountId`).
   *
   * Đây là field DUY NHẤT dùng `$set` (ghi đè bằng giá trị mới nhất) — các field số dùng
   * `$inc`. Rỗng `""` khi entry không có username snapshot → UI fallback về `accountId`.
   */
  username: string;
  /** Tổng tiền cược của account trong kỳ (VND). */
  amount: number;
  /** Số entry của account trong kỳ. */
  entries: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface Max3dDrawAccountStatsEntity extends Omit<Max3dDrawAccountStatsDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
