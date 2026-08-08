/**
 * Max 3D Pro – Draw Account Stats (tích luỹ cược theo ACCOUNT trong 1 kỳ)
 *
 * Collection: max3dpro_draw_account_stats — 1 document / (draw × accountId).
 *
 * ## Vì sao collection riêng thay vì mảng `topAccounts` trong stats doc?
 *
 * `topAccounts` là top-K theo metric TÍCH LUỸ (`amount`): account rơi khỏi top-K rồi cược
 * thêm thì không seed lại được → drift. Sửa gốc: mỗi account 1 doc, `$inc` upsert
 * idempotent theo watermark, `topAccounts` derive bằng `sort({amount:-1}).limit(K)` lúc đọc
 * snapshot → chính xác tuyệt đối (p0-01 §1, giống `keno_draw_account_stats`).
 *
 * ## Retention
 *
 * TTL index `{ createdAt: 1 }, expireAfterSeconds` 90 ngày (tạo thủ công theo
 * `MAX3D_PRO_INDEXES`). KHÔNG cleanup batch trong app.
 */

import type { DeltaAccumulatedDoc } from "@megawin/game-core/types";

/**
 * Tích luỹ cược của 1 account trong 1 kỳ.
 *
 * `amount`/`entries`/`sets` cộng bằng `$inc` có điều kiện watermark → idempotent. `username`
 * là snapshot lúc cược (`$set` mỗi lần ghi — luôn lấy giá trị mới nhất). Xem
 * {@link DeltaAccumulatedDoc}.
 */
export interface Max3dproDrawAccountStatsDoc extends DeltaAccumulatedDoc {
  /** MongoDB ObjectId. */
  _id: unknown;
  /** drawId dạng `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** ID account. Unique cùng `drawId`. */
  accountId: string;
  /** Username hiển thị (snapshot lúc cược) — `""` khi entry không có username. */
  username: string;
  /** Tổng tiền cược của account trong kỳ (VND). */
  amount: number;
  /** Số entry của account trong kỳ. */
  entries: number;
  /** Σ betCount của account trong kỳ. */
  sets: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface Max3dproDrawAccountStatsEntity extends Omit<Max3dproDrawAccountStatsDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
