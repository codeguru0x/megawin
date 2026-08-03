/**
 * Keno – Draw Combo Stats (chi tiết combo theo bộ số, MỌI play type)
 *
 * Collection: keno_draw_combo_stats — 1 document / (draw × combo).
 *
 * Mục đích: (1) phát hiện dồn cược 1 bộ số (syndicate); (2) drill-down `capSets`;
 * (3) nền minh bạch player (p1-01); (4) **nguồn CHÍNH XÁC cho `topCombos`** — thay thế
 * mảng top-K trong stats doc vốn bị drift (p2-01 §3.5).
 *
 * ## Vì sao track MỌI play type, không chỉ pick 8/9/10 cappable?
 *
 * Thiết kế ban đầu chỉ track cappable vì lo "pick thấp cardinality nổ" — nhưng đó là
 * lẫn lộn **không gian lý thuyết** với **số doc thực tế**: doc chỉ sinh cho combo THỰC SỰ
 * có người cược. Kỳ 10k entry → tối đa ~10k combo distinct, bất kể pick mấy (không gian
 * C(80,5)=24tr không liên quan). Track đủ → `topCombos` chính xác tuyệt đối, xoá được
 * `ComboState`/`baselineAccounts`/drift trong accumulator (p2-01 §3.5.1).
 *
 * ## Vì sao `accountCount` (số) thay vì `accounts[]` (mảng object)?
 *
 * Mảng object phình theo **số người chơi** (không phải hằng số nghiệp vụ) → chạm BSON
 * 16MB khi 1 combo hot có ~100k account, và buộc read-modify-write full array mỗi tick.
 * Chi tiết per-account tách sang {@link KenoDrawComboAccountDoc} ghi bằng `$inc` upsert.
 * `accountCount` là counter vô hướng → **index được** (rule combo_concentration query
 * `{drawId, accountCount: {$gte: n}}` thay `$expr $size` không sargable). Xem `mongodb.mdc` §8.1–8.2.
 */

import type { DeltaAccumulatedDoc } from "@megawin/game-core/types";
import type { KenoPlayType } from "./enums";

/**
 * Thống kê 1 combo trong 1 kỳ — tổng hợp vô hướng, KHÔNG chứa mảng người chơi.
 *
 * Chi tiết từng account nằm ở {@link KenoDrawComboAccountDoc} (1 doc/account) — tách ra
 * để doc này có kích thước **cố định** bất kể bao nhiêu người cược.
 *
 * `sets`/`amount` cộng bằng `$inc` có điều kiện watermark → idempotent, xem
 * {@link DeltaAccumulatedDoc}.
 */
export interface KenoDrawComboStatsDoc extends DeltaAccumulatedDoc {
  /** MongoDB ObjectId. */
  _id: unknown;
  /** drawId dạng `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Khoá combo: `${playType}:${sortedNumbers.join(",")}`. Unique cùng drawId. */
  comboKey: string;
  /**
   * Play type của combo — lưu tách khỏi `comboKey` để `topCombos` build được DTO mà
   * không phải parse chuỗi khoá, và để filter/group theo play type khi cần.
   */
  playType: KenoPlayType;
  /** Bộ số đã sort (zero-padded `"01".."80"`) — hiển thị trực tiếp, không parse `comboKey`. */
  numbers: string[];
  /** Tổng bộ cược combo này (Σ betCount mọi account). */
  sets: number;
  /** Tổng tiền vào combo này (VND). */
  amount: number;
  /**
   * Số account distinct đã cược combo.
   *
   * Counter vô hướng (KHÔNG derive từ mảng) để: (1) index được cho rule
   * combo_concentration; (2) doc không phình theo số người chơi. Tăng đúng 1 lần/account
   * nhờ đếm `upsertedCount` của lần `$inc` đầu tiên trên
   * {@link KenoDrawComboAccountDoc}.
   */
  accountCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface KenoDrawComboStatsEntity extends Omit<KenoDrawComboStatsDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}

/**
 * Chi tiết 1 account đã cược 1 combo — 1 doc / (draw × combo × account).
 *
 * Collection: keno_draw_combo_accounts. Tách khỏi {@link KenoDrawComboStatsDoc} để mảng
 * người chơi không nằm trong document (p2-01 R1). Ghi bằng `$inc` upsert có điều kiện
 * watermark → **không read-modify-write, không giới hạn số account, idempotent**
 * (xem {@link DeltaAccumulatedDoc}).
 *
 * Chỉ đọc khi staff drill-down 1 combo cụ thể (`getComboAccounts`) — không đọc theo tick.
 */
export interface KenoDrawComboAccountDoc extends DeltaAccumulatedDoc {
  /** MongoDB ObjectId. */
  _id: unknown;
  /** drawId dạng `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Khoá combo — cùng convention `KenoDrawComboStatsDoc.comboKey`. */
  comboKey: string;
  /** ID account đã cược combo này. */
  accountId: string;
  /** Username snapshot lúc ghi (từ entry — KHÔNG query bảng account riêng). */
  username: string;
  /** Số bộ account này cược vào combo (Σ betCount). */
  sets: number;
  /** Tổng tiền account này vào combo (VND). */
  amount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface KenoDrawComboAccountEntity extends Omit<KenoDrawComboAccountDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
