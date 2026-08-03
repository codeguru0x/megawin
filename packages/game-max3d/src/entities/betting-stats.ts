/**
 * Max 3D – Draw Betting Stats (pre-aggregated realtime stats)
 *
 * Collection: max3d_draw_betting_stats — 1 document / draw.
 *
 * Thay toàn bộ ops aggregation on-demand (`aggregateOpsSummary / TripletFrequency /
 * PlayTypeDistribution / TenantBreakdown / TopSingleCombos / TopPlusCombos`) bằng
 * findOne O(1). Worker mini-batch cập nhật async theo watermark insert-stream.
 *
 * ĐẶC THÙ Max 3D (analysis max3d-ops §3.2):
 * - `tripletStakes`: Record SPARSE key "000".."999" (chỉ triplet có cược, bounded 1000)
 *   — vừa là nguồn histogram chữ số/top triplets UI, vừa là INPUT exposure basic
 *   CHÍNH XÁC per-slot (rules/exposure.ts). Units tách 3 nhóm straight/combo3/combo6
 *   vì prize khác nhau. LƯU RAW tuyến tính — biến đổi phi tuyến (greedy max) ở tầng đọc.
 * - `topPairs`/`topAccounts` KHÔNG còn nằm trong doc này (p0-03) — top-K theo metric TÍCH
 *   LUỸ derive lúc đọc từ `max3d_draw_pair_stats`/`max3d_draw_account_stats` (hết drift).
 * - KHÔNG lưu `exposure` trong doc (hàm thuần tầng đọc — bài học Keno Risk #4).
 */

import type {
  DrawBettingStatsBase,
  DrawBettingTotals,
  TenantBettingStat,
  OpsStatsConfig,
} from "@megawin/game-core/types";

export type { DrawBettingStatsBase, DrawBettingTotals, TenantBettingStat, OpsStatsConfig };

/** Thống kê tiền/bộ của 1 nhóm kiểu chơi (basicStraight/basicCombo3/basicCombo6/plus). */
export interface Max3dPlayTypeStat {
  /** Tổng tiền cược (VND). Công thức: Σ(board.lineCount × betCount × unitPrice). */
  amount: number;
  /** Tổng đơn vị dự thưởng (Σ lineCount × betCount). */
  units: number;
  /**
   * Số **board** thuộc nhóm này (`+= 1` mỗi board) — KHÁC `DrawBettingTotals.sets`
   * (`Σ betCount`). Tên `boards` ở đây ĐÚNG nghĩa, không đổi theo rename 02/08/2026.
   */
  boards: number;
  /**
   * XẤP XỈ, KHÔNG phải số entry thật của nhóm — accumulator `+1` mỗi BOARD thuộc
   * nhóm (không dedupe theo entry: 1 entry nhiều board cùng nhóm bị tính nhiều lần).
   * `$inc` cộng dồn qua batch, p0-01 đã bỏ recompute nên sai số không tự sửa lại.
   * Tổng entries chính xác cấp draw dùng `DrawBettingTotals.entries`, không suy ra
   * từ field này.
   */
  entries: number;
}

/**
 * Phân bổ theo mode/playType — thay aggregatePlayTypeDistribution.
 * 4 nhóm: basic tách straight/combo3/combo6 (prize khác nhau) + plus.
 */
export interface Max3dByPlayType {
  basicStraight: Max3dPlayTypeStat;
  basicCombo3: Max3dPlayTypeStat;
  basicCombo6: Max3dPlayTypeStat;
  plus: Max3dPlayTypeStat;
}

/**
 * Stake tích luỹ trên 1 triplet — INPUT exposure basic per-slot (analysis §3.4a).
 *
 * Units tách 3 nhóm vì prize/tier khác nhau (straight 1tr / combo3 340k / combo6 170k
 * ở bậc ĐB). Combo cộng theo TỪNG HOÁN VỊ: board combo3 "112" → mỗi perm (112/121/211)
 * là 1 key riêng nhận `combo3Units += betCount` — đúng semantics mỗi hoán vị là 1 line
 * dự thưởng (khớp `getUniquePermutations` + settle).
 */
export interface Max3dTripletStake {
  /** Σ betCount các board basic straight chọn đúng triplet này. */
  straightUnits: number;
  /** Σ betCount các board combo3 có HOÁN VỊ = triplet này. */
  combo3Units: number;
  /** Σ betCount các board combo6 có HOÁN VỊ = triplet này. */
  combo6Units: number;
  /** Dòng tiền quy cho triplet (VND) — Σ tiền board chứa nó (không chia). */
  amount: number;
  /** Số **board** chứa triplet này (`+= 1` mỗi board) — không phải `Σ betCount`. */
  boards: number;
}

/**
 * 1 cặp plus bị dồn cược — phát hiện syndicate + tính liability ĐB (analysis §3.4b).
 *
 * `pairKey` UNORDERED `"t1,t2"` (2 triplet sort tăng — Max 3D plus khớp ĐB bipartite
 * không thứ tự; tiền lệ `$sortArray` trong aggregateTopPlusCombos cũ). Max 3D Pro
 * dùng ORDERED key — KHÁC, không copy chéo.
 */
export interface Max3dTopPair {
  /** Khoá cặp unordered `"t1,t2"` (t1 ≤ t2 sau sort). */
  pairKey: string;
  /** Triplet nhỏ hơn (sau sort). */
  triplet1: string;
  /** Triplet lớn hơn (sau sort). */
  triplet2: string;
  /** Σ betCount vào cặp này — liabilityĐB = units × plusPrizes.special (tầng đọc). */
  units: number;
  /** Số account distinct cược cặp này — nguồn `max3d_draw_pair_stats.accountCount` (p0-03). */
  accounts: number;
  /** Tổng tiền vào cặp (VND). */
  amount: number;
}

/**
 * 1 vé nguy hiểm nhất theo potentialWin — "ai cầm vé to nhất".
 *
 * `potentialWin` là PROXY Σ maxUnitWin per board (thiên cao — chốt §7 Q5; outcome
 * space 1000²⁰ không enumerate được như Bingo18).
 */
export interface Max3dTopPotential {
  /** ID entry (hex string). */
  entryId: string;
  /** ID account sở hữu — dựng link outstanding khi điều tra. */
  accountId: string;
  /**
   * Username hiển thị (snapshot lúc cược) — cùng tên field với `TicketEntryDoc.username`.
   * Rỗng `""` khi thiếu snapshot — UI fallback `accountId`.
   */
  username: string;
  /** Tổng tiền cược của entry (VND). */
  amount: number;
  /** Worst-case entry này trả (VND) — proxy Σ max per board, ghi rõ "ước tính" trên UI. */
  potentialWin: number;
}

/**
 * Thống kê realtime 1 kỳ Max 3D — 1 document / draw, worker cập nhật async.
 *
 * Extends `DrawBettingStatsBase` (game-core). Kích thước: tripletStakes bounded 1000
 * key (~80KB worst, thực tế thưa hơn nhiều) + topPotential K≤100 — 3 kỳ/tuần nên tổng
 * dung lượng không đáng kể. Đọc luôn là `findOne({ drawId })` → O(1).
 */
export interface Max3dDrawBettingStatsDoc extends DrawBettingStatsBase {
  /** MongoDB ObjectId. */
  _id: unknown;

  /** Phân bổ 4 nhóm kiểu chơi. */
  byPlayType: Max3dByPlayType;

  /** Stake per-triplet SPARSE — key "000".."999" chỉ chứa triplet có cược. */
  tripletStakes: Record<string, Max3dTripletStake>;

  /** Top entry nguy hiểm nhất theo potentialWin (proxy), sort desc — cắt `topPotentialK`. */
  topPotential: Max3dTopPotential[];
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface Max3dDrawBettingStatsEntity extends Omit<Max3dDrawBettingStatsDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
