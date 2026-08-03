/**
 * Max 3D – Draw Pair Stats (tích luỹ cược theo cặp plus trong 1 kỳ)
 *
 * Collection: max3d_draw_pair_stats — 1 document / (draw × pairKey).
 *
 * ## Vì sao cần collection riêng thay vì mảng `topPairs` trong stats doc?
 *
 * `topPairs` là top-K theo metric **TÍCH LUỸ** (`units`/`amount` cộng dồn). Nuôi mảng top-K
 * trong stats doc buộc seed lại từ doc mỗi tick → cặp rơi khỏi top-K **mất toàn bộ lịch sử**,
 * lần cược sau tính lại từ 0 → tổng hụt, xếp hạng sai (analysis §5.7, band-aid
 * `Math.max(baselineAccounts, ...)` là hệ quả trực tiếp của lỗ hổng này).
 *
 * Sửa gốc (giống Keno combo): mọi cặp đều có doc riêng, ghi bằng `$inc` upsert (không RMW,
 * idempotent theo watermark). `topPairs` derive bằng `sort({units:-1}).limit(K)` trên index
 * → **chính xác tuyệt đối**, không phụ thuộc K, không cần recompute lúc đóng bán.
 *
 * `accountCount` là counter **phái sinh** — KHÔNG `$inc` theo "account mới trong tick" (lỗ
 * hổng không vá được nếu crash giữa 2 lệnh ghi). Thay vào đó `$set` tuyệt đối từ
 * `PairAccountsRepository.countAccountsByPair` — tự hội tụ sau mọi crash (giống Keno
 * `ComboStatsRepository.syncAccountCounts`).
 *
 * ## Retention
 *
 * TTL index `{ createdAt: 1 }, expireAfterSeconds` 90 ngày (tạo thủ công theo
 * `MAX3D_INDEXES`). KHÔNG cleanup batch trong app.
 */

import type { DeltaAccumulatedDoc } from "@megawin/game-core/types";

/**
 * Tích luỹ cược của 1 cặp plus trong 1 kỳ.
 *
 * `units`/`amount` cộng dồn bằng `$inc` — KHÔNG bao giờ `$set`. `accountCount` là counter
 * phái sinh — `$set` tuyệt đối, KHÔNG `$inc`. Idempotent nhờ watermark per-doc, xem
 * {@link DeltaAccumulatedDoc}.
 */
export interface Max3dDrawPairStatsDoc extends DeltaAccumulatedDoc {
  /** MongoDB ObjectId. */
  _id: unknown;
  /** drawId dạng `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Khoá cặp unordered `"t1,t2"` (t1 ≤ t2 sau sort). Unique cùng `drawId`. */
  pairKey: string;
  /** Triplet nhỏ hơn (sau sort). */
  triplet1: string;
  /** Triplet lớn hơn (sau sort). */
  triplet2: string;
  /** Σ betCount vào cặp này — liabilityĐB = units × plusPrizes.special (tầng đọc). */
  units: number;
  /** Tổng tiền vào cặp (VND). */
  amount: number;
  /**
   * Số account distinct đã cược cặp này — counter phái sinh, `$set` từ
   * `PairAccountsRepository.countAccountsByPair`. KHÔNG `$inc`.
   */
  accountCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface Max3dDrawPairStatsEntity extends Omit<Max3dDrawPairStatsDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}

/**
 * Chi tiết 1 account đã cược 1 cặp plus — 1 doc / (draw × pairKey × account).
 *
 * Collection: max3d_draw_pair_accounts. Tách khỏi {@link Max3dDrawPairStatsDoc} để mảng
 * người chơi không nằm trong document (giống Keno `KenoDrawComboAccountDoc`). Ghi bằng
 * `$inc` upsert có điều kiện watermark → không read-modify-write, không giới hạn số
 * account, idempotent.
 *
 * Chỉ dùng để đếm `accountCount` phái sinh — KHÔNG có UI drill-down riêng (khác Keno).
 */
export interface Max3dDrawPairAccountDoc extends DeltaAccumulatedDoc {
  /** MongoDB ObjectId. */
  _id: unknown;
  /** drawId dạng `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Khoá cặp — cùng convention `Max3dDrawPairStatsDoc.pairKey`. */
  pairKey: string;
  /** ID account đã cược cặp này. */
  accountId: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface Max3dDrawPairAccountEntity extends Omit<Max3dDrawPairAccountDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
