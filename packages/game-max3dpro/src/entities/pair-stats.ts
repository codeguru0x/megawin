/**
 * Max 3D Pro – Draw Pair Stats (tích luỹ cược theo CẶP ORDERED trong 1 kỳ)
 *
 * Collection: max3dpro_draw_pair_stats — 1 document / (draw × pairKey ORDERED).
 *
 * ## Vì sao collection riêng thay vì mảng `topPairs` trong stats doc?
 *
 * Max 3D Pro sinh CẶP ORDERED (`"first>second"`, thứ tự quan trọng — ĐB đúng chiều 2 tỷ,
 * phụ ĐB ngược chiều 400tr). multiNumber 20 bộ = 380 ordered pairs/board → không gian tới
 * 10⁶ cặp. Nuôi mảng top-K trong stats doc theo metric **TÍCH LUỸ** (`units`/`amount`) thì
 * cặp rơi khỏi top-K mất lịch sử → drift; và giữ `Set<accountId>` per-pair trong RAM là
 * điểm nặng nhất trong 4 game (p0-01 §1).
 *
 * Sửa gốc: mỗi cặp có doc riêng, ghi bằng `$inc` upsert (idempotent theo watermark).
 * `topPairs` derive bằng `sort({units:-1}).limit(K)` trên index → chính xác tuyệt đối.
 *
 * ## ⚠️ ORDERED tuyệt đối — KHÔNG sort/normalize
 *
 * `pairKey = "${first}>${second}"` (mũi tên `>`, khác `,` unordered của Max 3D): (A,B) và
 * (B,A) là 2 KEY KHÁC NHAU. Tầng đọc CỘNG CẢ 2 KEY khi tính liability 1 outcome. TUYỆT ĐỐI
 * không sort/normalize `(first, second)` ở bất kỳ đâu (ghi hay đọc).
 *
 * ## Retention
 *
 * TTL index `{ createdAt: 1 }, expireAfterSeconds` 90 ngày (tạo thủ công theo
 * `MAX3D_PRO_INDEXES` — xem `mongodb.mdc` §7). KHÔNG cleanup batch trong app.
 */

import type { DeltaAccumulatedDoc } from "@megawin/game-core/types";

/**
 * Tích luỹ cược của 1 cặp ORDERED trong 1 kỳ.
 *
 * `units`/`amount`/`accountCount` cộng bằng `$inc` có điều kiện watermark → idempotent,
 * KHÔNG read-modify-write. Xem {@link DeltaAccumulatedDoc}.
 */
export interface Max3dproDrawPairStatsDoc extends DeltaAccumulatedDoc {
  /** MongoDB ObjectId. */
  _id: unknown;
  /** drawId dạng `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Khoá cặp ORDERED `"first>second"` — KHÔNG sort. Unique cùng `drawId`. */
  pairKey: string;
  /** Bộ ba thứ nhất (đúng thứ tự cược). */
  first: string;
  /** Bộ ba thứ hai (đúng thứ tự cược). */
  second: string;
  /** Σ betCount vào chiều này. */
  units: number;
  /** Tổng tiền vào chiều này (VND). */
  amount: number;
  /**
   * Số account distinct đã cược cặp này (chiều này).
   *
   * Counter phái sinh: `$set` giá trị tuyệt đối đếm lại từ `max3dpro_draw_pair_accounts`
   * (self-healing, khác `$inc` "account mới trong tick" mất là mất vĩnh viễn).
   */
  accountCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface Max3dproDrawPairStatsEntity extends Omit<Max3dproDrawPairStatsDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}

/**
 * Chi tiết 1 account đã cược 1 cặp ORDERED — 1 doc / (draw × pairKey × accountId).
 *
 * Collection: max3dpro_draw_pair_accounts. Tách khỏi {@link Max3dproDrawPairStatsDoc} để
 * `accountCount` đếm được distinct chính xác mà doc pair không giữ mảng người chơi (không
 * phình theo số account). Ghi bằng `$inc` upsert có điều kiện watermark → idempotent.
 *
 * Chỉ đọc để đếm distinct (`countAccountsByPair`) — không đọc theo tick khác.
 */
export interface Max3dproDrawPairAccountDoc extends DeltaAccumulatedDoc {
  /** MongoDB ObjectId. */
  _id: unknown;
  /** drawId dạng `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Khoá cặp ORDERED — cùng convention `Max3dproDrawPairStatsDoc.pairKey`. */
  pairKey: string;
  /** ID account đã cược cặp này. */
  accountId: string;
  /** Σ betCount account này vào cặp. */
  units: number;
  /** Tổng tiền account này vào cặp (VND). */
  amount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface Max3dproDrawPairAccountEntity
  extends Omit<Max3dproDrawPairAccountDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
