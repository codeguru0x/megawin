/**
 * Lotto 5/35 – Draw Combo Stats (chi tiết combo theo BOARD người chơi chọn)
 *
 * Collection: lotto535_draw_combo_stats — 1 document / (draw × combo).
 *
 * Mục đích: (1) phát hiện dồn cược 1 bộ số (syndicate); (2) drill-down staff
 * `combo-lookup`; (3) nền minh bạch player `jackpotUnits` (p1-01); (4) nguồn CHÍNH
 * XÁC cho `topCombos` (derive lúc đọc, không lưu top-K trong stats doc).
 *
 * Port từ Power 6/55 (`packages/game-power655/src/entities/combo-stats.ts`) —
 * KHÁC Power 6/55: `comboKey` thêm **chiều số đặc biệt** (`specialNumbers`) vì
 * Lotto 5/35 chọn 5 chính + 1..12 ĐB tuỳ playType, trong khi Power 6/55 chỉ có 1
 * chiều số (main). Xem `rules/combo-key.ts` cho format chi tiết.
 *
 * ## `comboKey` theo BOARD, KHÔNG expand lines (KHÁC Keno "pick numbers")
 *
 * Combo = BOARD (`playType:sortedMain|sortedSpecial`) — vé `mainCover15` (15 số
 * chính đã chọn) = 1 combo doc, KHÔNG expand C(15,5) = 3.003 combo. Lý do: track
 * theo line sẽ nổ cardinality nếu nhiều board `mainCover` lớn cùng chọn 1 bộ số
 * (không gian C(N,5) không liên quan tới số doc thực tế — chỉ sinh doc khi có
 * board thật chọn đúng playType+numbers đó).
 *
 * Hai board CÙNG bộ số (main + special) + CÙNG playType từ 2 account khác nhau
 * → cùng 1 combo doc → tín hiệu syndicate.
 *
 * ## Vì sao `accountCount` (số) thay vì mảng account?
 *
 * Mảng phình theo số người chơi (không phải hằng số nghiệp vụ) → chạm BSON 16MB.
 * Chi tiết per-account tách sang {@link Lotto535DrawComboAccountDoc}. `accountCount`
 * là counter vô hướng → index được cho rule `combo_concentration`
 * (`{drawId, accountCount: {$gte: n}}`), copy pattern Power 6/55/Keno.
 */

import type { DeltaAccumulatedDoc } from "@megawin/game-core/types";

import type { PlayType } from "./enums";

/**
 * Thống kê 1 combo (board) trong 1 kỳ — tổng hợp vô hướng, KHÔNG chứa mảng người chơi.
 *
 * Chi tiết từng account nằm ở {@link Lotto535DrawComboAccountDoc} (1 doc/account) —
 * tách ra để doc này có kích thước CỐ ĐỊNH bất kể bao nhiêu người cược.
 *
 * `sets`/`amount` cộng bằng `$inc` có điều kiện watermark → idempotent, xem
 * {@link DeltaAccumulatedDoc}.
 */
export interface Lotto535DrawComboStatsDoc extends DeltaAccumulatedDoc {
  /** MongoDB ObjectId. */
  _id: unknown;
  /** drawId dạng `YYYY-MM-DD.NNN`. */
  drawId: string;
  /**
   * Khoá combo theo BOARD: `${playType}:${sortedMain.join(",")}|${sortedSpecial.join(",")}`.
   * Unique cùng `drawId`. VD: `"mainCover6:01,05,12,20,33,35|07"`.
   * Build bằng `buildComboKey` (`rules/combo-key.ts`) — KHÔNG tự parse chuỗi tay.
   */
  comboKey: string;
  /**
   * Play type của combo — lưu tách khỏi `comboKey` để build DTO không phải parse
   * chuỗi khoá, và để filter/group theo play type (đặc biệt nhánh `$all`
   * mainCover6–15 tính `jackpotUnits` — p1-01, cần bound theo `playType` để không
   * quét biển combo standard, xem index `{drawId, playType, mainNumbers}`).
   */
  playType: PlayType;
  /**
   * Số chính đã sort (zero-padded `"01".."35"`) — hiển thị trực tiếp, không parse
   * `comboKey`. Số lượng phụ thuộc `playType` (4 = mainCover4, 5 = standard/specialCover,
   * 6–15 = mainCoverN).
   */
  mainNumbers: string[];
  /**
   * Số đặc biệt đã sort (zero-padded `"01".."12"`) — hiển thị trực tiếp, không parse
   * `comboKey`. Số lượng phụ thuộc `playType` (1 = standard/mainCover4/mainCoverN,
   * 2–12 = specialCover).
   */
  specialNumbers: string[];
  /** Tổng bộ cược combo này (Σ `expandedLines × betCount` mọi board cùng key). */
  sets: number;
  /** Tổng tiền vào combo này (VND). */
  amount: number;
  /**
   * Số account distinct đã cược combo.
   *
   * Counter vô hướng — sync bằng `syncAccountCounts` (`$set` tuyệt đối, KHÔNG
   * `$size` mảng — mongodb.mdc §8), tính từ `countAccountsByCombo` trên
   * {@link Lotto535DrawComboAccountDoc}.
   */
  accountCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface Lotto535DrawComboStatsEntity extends Omit<Lotto535DrawComboStatsDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}

/**
 * Chi tiết 1 account đã cược 1 combo — 1 doc / (draw × combo × account).
 *
 * Collection: lotto535_draw_combo_accounts. Tách khỏi {@link Lotto535DrawComboStatsDoc}
 * để mảng người chơi không nằm trong document. Ghi bằng `$inc` upsert có điều kiện
 * watermark → KHÔNG read-modify-write, KHÔNG giới hạn số account, idempotent
 * (xem {@link DeltaAccumulatedDoc}).
 *
 * Chỉ đọc khi staff drill-down 1 combo cụ thể (`listByCombo`) — không đọc theo tick.
 */
export interface Lotto535DrawComboAccountDoc extends DeltaAccumulatedDoc {
  /** MongoDB ObjectId. */
  _id: unknown;
  /** drawId dạng `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Khoá combo — cùng convention `Lotto535DrawComboStatsDoc.comboKey`. */
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
export interface Lotto535DrawComboAccountEntity extends Omit<Lotto535DrawComboAccountDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
