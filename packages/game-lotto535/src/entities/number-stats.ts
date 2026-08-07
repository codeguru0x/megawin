/**
 * Lotto 5/35 – Draw Number Stats (tần suất từng số trong 1 kỳ, 2 chiều số)
 *
 * Collection: lotto535_draw_number_stats — 1 document / (draw × kind × số).
 *
 * Port từ Power 6/55 (`packages/game-power655/src/entities/number-stats.ts`) —
 * tách collection riêng ngay từ đầu (KHÔNG nhúng trong stats doc, xem lý do đầy
 * đủ trong file Power 6/55). KHÁC Power 6/55: Lotto 5/35 có **2 không gian số**
 * (35 số chính + 12 số đặc biệt) — thêm chiều `kind` để phân biệt.
 *
 * ≤47 doc/kỳ (35 main + 12 special) — vẫn rẻ để `find({drawId})` toàn bộ cho
 * heatmap 2 lưới. Doc `kind=special` là đầu vào TRỰC TIẾP cho rule `special_skew`
 * (analysis §3.7) — không gian ĐB chỉ 12 số nên tỷ trọng dồn vào 1 số dễ vượt
 * ngưỡng hơn nhiều so với 35 số chính.
 *
 * Xem `.cursor/analysis/lotto535-operations-risk-control.analysis.md` §3.3.
 */

import type { DeltaAccumulatedDoc } from "@megawin/game-core/types";

/**
 * Chiều số của 1 doc number-stats — số chính (`"01".."35"`) hay số đặc biệt
 * (`"01".."12"`). Const-as-const + type dẫn xuất (rule code-quality §5.3).
 */
export const Lotto535NumberKind = {
  /** Số chính, zero-padded "01".."35". */
  Main: "main",
  /** Số đặc biệt, zero-padded "01".."12". */
  Special: "special",
} as const;
export type Lotto535NumberKind = (typeof Lotto535NumberKind)[keyof typeof Lotto535NumberKind];

/**
 * Tích luỹ 1 số (chính hoặc đặc biệt) trong 1 kỳ — đếm theo `board.mainNumbers`
 * (`kind=main`) hoặc `board.specialNumbers` (`kind=special`), KHÔNG expand lines.
 *
 * 1 board `mainCover15` (15 số chính đã chọn) chạm đúng 15 doc `kind=main`,
 * KHÔNG phải 3.003 (số lines sau expand C(15,5)) — số xuất hiện trong board nào
 * thì cộng TRỌN board đó, không chia (kết luận toán học Keno §3.7 áp dụng nguyên).
 *
 * Mọi field số cộng bằng `$inc` — KHÔNG bao giờ `$set`. Idempotent nhờ watermark
 * per-doc, xem {@link DeltaAccumulatedDoc}.
 */
export interface Lotto535DrawNumberStatsDoc extends DeltaAccumulatedDoc {
  /** MongoDB ObjectId. */
  _id: unknown;
  /** drawId dạng `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Chiều số — main hay special. Unique cùng `drawId` + `number`. */
  kind: Lotto535NumberKind;
  /** Số, zero-padded theo `kind` ("01".."35" cho main, "01".."12" cho special). */
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
export interface Lotto535DrawNumberStatsEntity extends Omit<Lotto535DrawNumberStatsDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
