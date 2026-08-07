/**
 * Power 6/55 – Draw Number Stats (tần suất từng số trong 1 kỳ)
 *
 * Collection: power655_draw_number_stats — 1 document / (draw × số).
 *
 * ## KHÁC KENO CÓ CHỦ ĐÍCH — tách collection riêng ngay từ đầu
 *
 * Keno nhúng `numberFreq` 80 key trong stats doc (bounded, hằng số nghiệp vụ). Power
 * 6/55 quyết định TÁCH riêng dù chỉ có 55 key — quyết định user 05/08/2026:
 *
 * 1. **Lý do chính**: chừa đường thêm chỉ số UNBOUNDED per số trong tương lai
 *    (drill-down account cược nhiều vào 1 số, time-series theo giờ trong cửa sổ
 *    bán 3 ngày) mà KHÔNG cần refactor stats doc.
 * 2. **Lý do phụ**: đồng nhất 1 pattern ghi duy nhất (`bulkUpsertDelta` + watermark
 *    per-doc) với combo/account stats; index/sort per số độc lập.
 * 3. **Chi phí chấp nhận**: +1 collection/repo, mỗi batch thêm 1 `bulkWrite` ≤55
 *    ops, snapshot API ghép 2 query (`findOne` stats + `find({drawId})` ≤55 docs)
 *    — vẫn O(1) thực tế.
 *
 * Xem `.cursor/analysis/power655-operations-risk-control.analysis.md` §3.3, §6.1-D1.
 */

import type { DeltaAccumulatedDoc } from "@megawin/game-core/types";

/**
 * Tích luỹ 1 số trong 1 kỳ — đếm theo `board.mainNumbers`, KHÔNG expand lines.
 *
 * 1 board Bao 18 (18 số đã chọn) chạm đúng 18 doc số, KHÔNG phải 18.564 (số lines
 * sau expand C(18,6)) — số xuất hiện trong board nào thì cộng TRỌN board đó, không
 * chia (kết luận toán học Keno §3.7 áp dụng nguyên).
 *
 * Mọi field số cộng bằng `$inc` — KHÔNG bao giờ `$set`. Idempotent nhờ watermark
 * per-doc, xem {@link DeltaAccumulatedDoc}.
 */
export interface Power655DrawNumberStatsDoc extends DeltaAccumulatedDoc {
  /** MongoDB ObjectId. */
  _id: unknown;
  /** drawId dạng `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Số chính, zero-padded "01".."55". Unique cùng `drawId`. */
  number: string;
  /** Số bộ cược quy cho số này: Σ(board.expandedLines × betCount) các board chứa số này. */
  sets: number;
  /**
   * Dòng tiền quy cho số này (VND): Σ(board amount) các board chứa số — KHÔNG chia
   * (số xuất hiện trong board nào thì cộng trọn tiền board đó, theo Keno §3.7).
   */
  amount: number;
  /**
   * Số board chứa số này (KHÔNG nhân betCount) — phân biệt "nhiều người chọn số
   * này" (boards lớn) vs "ít người nhưng cược đậm" (sets/amount lớn, boards nhỏ).
   */
  boards: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface Power655DrawNumberStatsEntity extends Omit<Power655DrawNumberStatsDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
