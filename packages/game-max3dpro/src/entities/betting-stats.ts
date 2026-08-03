/**
 * Max 3D Pro – Draw Betting Stats (pre-aggregated realtime stats)
 *
 * Collection: max3dpro_draw_betting_stats — 1 document / draw.
 *
 * Thay toàn bộ ops aggregation on-demand bằng findOne O(1). Worker mini-batch cập nhật
 * async theo watermark insert-stream.
 *
 * ĐẶC THÙ Max 3D Pro (analysis §3.2, plan Pro p0-02 §1):
 * - Mọi board là CẶP ORDERED (2 bộ ba, thứ tự quan trọng — ĐB đúng chiều 2 tỷ, phụ ĐB
 *   ngược chiều 400tr). Top cặp ORDERED KHÔNG còn trong doc này — dời sang collection
 *   `max3dpro_draw_pair_stats` (`Max3dproDrawPairStatsDoc`) để không phình theo không gian
 *   10⁶ cặp và không drift; tầng đọc derive `topPairs` từ đó (p0-01 §1).
 * - `tripletStakes` đơn giản (units/amount/boards per triplet distinct) — histogram +
 *   cơ sở proxy đuôi giải đơn Năm/Sáu (tier duy nhất tính theo triplet đơn).
 * - KHÔNG lưu `exposure` trong doc (hàm thuần tầng đọc — bài học Keno Risk #4).
 * - KHÔNG lưu `topAccounts` trong doc — dời sang `max3dpro_draw_account_stats` (p0-01 §1).
 */

import type {
  DrawBettingStatsBase,
  DrawBettingTotals,
  TenantBettingStat,
  TopAccountStat,
  OpsStatsConfig,
} from "@megawin/game-core/types";

export type {
  DrawBettingStatsBase,
  DrawBettingTotals,
  TenantBettingStat,
  TopAccountStat,
  OpsStatsConfig,
};

/** Thống kê tiền/bộ của 1 play mode (multiNumber/multiDigit). */
export interface Max3dproPlayTypeStat {
  /** Tổng tiền cược (VND). Công thức: Σ(board.lineCount × betCount × unitPrice). */
  amount: number;
  /** Tổng đơn vị dự thưởng (Σ lineCount × betCount — lineCount = số ordered pairs). */
  units: number;
  /**
   * Số board thuộc nhóm này (`+= 1` mỗi board) — KHÁC `DrawBettingTotals.sets`
   * (`Σ betCount`). Tên `boards` ở đây ĐÚNG nghĩa, không đổi theo rename 02/08/2026.
   */
  boards: number;
  /**
   * Số entry-hit của nhóm — `+= 1` mỗi board (xấp xỉ: 1 entry nhiều board cùng mode bị
   * đếm trùng). GIỮ (KHÔNG xoá — p1-01 Q3): FE Operations render "N phiếu" per-mode
   * (`analytics/panels.tsx`). Delta-only không recompute nên đây là xấp xỉ cố định, chấp
   * nhận cho mục đích hiển thị phân bổ tương đối giữa 2 mode.
   */
  entries: number;
}

/** Phân bổ theo playMode — Pro KHÔNG có basic/plus, chỉ 2 mode bao. */
export interface Max3dproByPlayType {
  multiNumber: Max3dproPlayTypeStat;
  multiDigit: Max3dproPlayTypeStat;
}

/** Stake tích luỹ trên 1 triplet distinct xuất hiện trong board (histogram + đuôi Năm/Sáu). */
export interface Max3dproTripletStake {
  /** Σ betCount các board chứa triplet này. */
  units: number;
  /** Dòng tiền quy cho triplet (VND) — Σ tiền board chứa nó (không chia). */
  amount: number;
  /** Số **board** chứa triplet này (`+= 1` mỗi board) — không phải `Σ betCount`. */
  boards: number;
}

/**
 * 1 cặp ORDERED bị dồn cược — phát hiện syndicate + liability ĐB/phụ ĐB.
 *
 * Shape ĐỌC/HIỂN THỊ (không lưu trong stats doc). Tầng đọc derive từ
 * `max3dpro_draw_pair_stats` (`Max3dproDrawPairStatsEntity`) lúc build snapshot/exposure.
 *
 * `pairKey = "${first}>${second}"` — GIỮ THỨ TỰ: (A,B) ăn ĐB khi kết quả = [A,B];
 * (B,A) ăn phụ ĐB cùng kết quả đó. Tầng đọc CỘNG CẢ 2 KEY khi tính liability 1 outcome.
 */
export interface Max3dproTopPair {
  /** Khoá cặp ORDERED `"first>second"` — KHÔNG sort. */
  pairKey: string;
  /** Bộ ba thứ nhất (đúng thứ tự cược). */
  first: string;
  /** Bộ ba thứ hai (đúng thứ tự cược). */
  second: string;
  /** Σ betCount vào chiều này. */
  units: number;
  /** Số account distinct cược chiều này (đếm từ `max3dpro_draw_pair_accounts`). */
  accounts: number;
  /** Tổng tiền vào chiều này (VND). */
  amount: number;
}

/**
 * 1 vé nguy hiểm nhất theo potentialWin — PROXY thiên cao (chốt §7 Q5):
 * `(special + specialSub) × betCount` mỗi board (multiNumber chứa mọi ordered pair
 * của tập chọn → gần như luôn có cả 2 chiều của cặp ĐB).
 */
export interface Max3dproTopPotential {
  /** ID entry (hex string). */
  entryId: string;
  /** ID account sở hữu — dựng link outstanding khi điều tra. */
  accountId: string;
  /** Username hiển thị (snapshot lúc cược). Rỗng `""` khi thiếu — UI fallback accountId. */
  username: string;
  /** Tổng tiền cược của entry (VND). */
  amount: number;
  /** Worst-case entry này trả (VND) — proxy, ghi rõ "ước tính" trên UI. */
  potentialWin: number;
}

/**
 * Thống kê realtime 1 kỳ Max 3D Pro — 1 document / draw, worker cập nhật async theo `$inc`.
 *
 * Extends `DrawBettingStatsBase` (game-core). Doc GIỮ TỐI THIỂU: totals/byPlayType/
 * tripletStakes/topPotential + byTenant. Top cặp ORDERED và top account KHÔNG nằm ở đây —
 * dời sang `max3dpro_draw_pair_stats` / `max3dpro_draw_account_stats` để không phình theo
 * không gian 10⁶ cặp và không drift. Đọc luôn là `findOne({ drawId })` → O(1).
 */
export interface Max3dproDrawBettingStatsDoc extends DrawBettingStatsBase {
  /** MongoDB ObjectId. */
  _id: unknown;

  /** Phân bổ 2 play mode. */
  byPlayType: Max3dproByPlayType;

  /** Stake per-triplet SPARSE — key "000".."999" chỉ chứa triplet có cược. */
  tripletStakes: Record<string, Max3dproTripletStake>;

  /** Top entry nguy hiểm nhất theo potentialWin (proxy), sort desc — cắt `topPotentialK`. */
  topPotential: Max3dproTopPotential[];
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface Max3dproDrawBettingStatsEntity extends Omit<Max3dproDrawBettingStatsDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
