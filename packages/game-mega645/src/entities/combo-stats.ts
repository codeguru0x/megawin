/**
 * Mega 6/45 – Draw Combo Stats (chi tiết combo theo BOARD người chơi chọn)
 *
 * Collection: mega645_draw_combo_stats — 1 document / (draw × combo).
 *
 * Mục đích: (1) phát hiện dồn cược 1 bộ số (syndicate); (2) drill-down staff
 * `combo-lookup`; (3) nền minh bạch player `jackpotUnits` (p1-01); (4) nguồn CHÍNH
 * XÁC cho `topCombos` (derive lúc đọc, không lưu top-K trong stats doc).
 *
 * ## `comboKey` theo BOARD, KHÔNG expand lines (KHÁC Keno "pick numbers")
 *
 * Combo Mega 6/45 = BOARD (`playType:sortedNumbers`) — vé Bao 18 (18 số đã chọn) = 1
 * combo doc, KHÔNG expand C(18,6) = 18.564 combo. Lý do: track theo line sẽ nổ
 * cardinality nếu nhiều board Bao lớn cùng chọn 1 bộ 18 số (không gian C(18,6)
 * không liên quan tới số doc thực tế — chỉ sinh doc khi có board thật chọn đúng
 * playType+numbers đó).
 *
 * Hai board CÙNG bộ số + CÙNG playType từ 2 account khác nhau → cùng 1 combo doc
 * → tín hiệu syndicate.
 *
 * ## Vì sao `accountCount` (số) thay vì mảng account?
 *
 * Mảng phình theo số người chơi (không phải hằng số nghiệp vụ) → chạm BSON 16MB.
 * Chi tiết per-account tách sang {@link Mega645DrawComboAccountDoc}. `accountCount`
 * là counter vô hướng → index được cho rule `combo_concentration`
 * (`{drawId, accountCount: {$gte: n}}`), copy pattern Power 6/55/Keno.
 */

import type { DeltaAccumulatedDoc } from "@megawin/game-core/types";

import type { PlayType } from "./enums";

/**
 * Thống kê 1 combo (board) trong 1 kỳ — tổng hợp vô hướng, KHÔNG chứa mảng người chơi.
 *
 * Chi tiết từng account nằm ở {@link Mega645DrawComboAccountDoc} (1 doc/account) —
 * tách ra để doc này có kích thước CỐ ĐỊNH bất kể bao nhiêu người cược.
 *
 * `sets`/`amount` cộng bằng `$inc` có điều kiện watermark → idempotent, xem
 * {@link DeltaAccumulatedDoc}.
 */
export interface Mega645DrawComboStatsDoc extends DeltaAccumulatedDoc {
  /** MongoDB ObjectId. */
  _id: unknown;
  /** drawId dạng `YYYY-MM-DD.NNN`. */
  drawId: string;
  /**
   * Khoá combo theo BOARD: `${playType}:${sortedNumbers.join(",")}`.
   * Unique cùng `drawId`. VD: `"bao7:01,05,12,23,34,45"`.
   */
  comboKey: string;
  /**
   * Play type của combo — lưu tách khỏi `comboKey` để build DTO không phải parse
   * chuỗi khoá, và để filter/group theo play type (đặc biệt nhánh `$all` bao7–18
   * tính `jackpotUnits` — p1-01, cần bound theo `playType` để không quét biển
   * combo standard, xem index `{drawId, playType, numbers}`).
   */
  playType: PlayType;
  /**
   * Bộ số đã sort (zero-padded `"01".."45"`) — hiển thị trực tiếp, không parse
   * `comboKey`. Số lượng phụ thuộc `playType` (5 = bao5, 6 = standard, 7–15 = baoN, 18 = bao18).
   */
  numbers: string[];
  /** Tổng bộ cược combo này (Σ `expandedLines × betCount` mọi board cùng key). */
  sets: number;
  /** Tổng tiền vào combo này (VND). */
  amount: number;
  /**
   * Số account distinct đã cược combo.
   *
   * Counter vô hướng — sync bằng `syncAccountCounts` (`$set` tuyệt đối, KHÔNG
   * `$size` mảng — mongodb.mdc §8), tính từ `countAccountsByCombo` trên
   * {@link Mega645DrawComboAccountDoc}.
   */
  accountCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface Mega645DrawComboStatsEntity extends Omit<Mega645DrawComboStatsDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}

/**
 * Chi tiết 1 account đã cược 1 combo — 1 doc / (draw × combo × account).
 *
 * Collection: mega645_draw_combo_accounts. Tách khỏi {@link Mega645DrawComboStatsDoc}
 * để mảng người chơi không nằm trong document. Ghi bằng `$inc` upsert có điều kiện
 * watermark → KHÔNG read-modify-write, KHÔNG giới hạn số account, idempotent
 * (xem {@link DeltaAccumulatedDoc}).
 *
 * Chỉ đọc khi staff drill-down 1 combo cụ thể (`listByCombo`) — không đọc theo tick.
 */
export interface Mega645DrawComboAccountDoc extends DeltaAccumulatedDoc {
  /** MongoDB ObjectId. */
  _id: unknown;
  /** drawId dạng `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Khoá combo — cùng convention `Mega645DrawComboStatsDoc.comboKey`. */
  comboKey: string;
  /** ID account đã cược combo này. */
  accountId: string;
  /** Username snapshot lúc ghi (từ entry — KHÔNG query bảng account riêng). */
  username: string;
  /** Số bộ account này cược vào combo (Σ `expandedLines × betCount`). */
  sets: number;
  /** Tổng tiền account này vào combo (VND). */
  amount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface Mega645DrawComboAccountEntity extends Omit<Mega645DrawComboAccountDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
