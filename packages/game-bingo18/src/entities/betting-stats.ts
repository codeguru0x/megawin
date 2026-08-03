/**
 * Bingo 18 – Draw Betting Stats (pre-aggregated realtime stats)
 *
 * Collection: bingo18_draw_betting_stats — 1 document / draw.
 *
 * Thay toàn bộ ops aggregation on-demand (`aggregateOpsSummary / DiceFrequency /
 * PlayTypeDistribution / TenantBreakdown / TopCombos`) bằng findOne O(1). Worker
 * mini-batch cập nhật async theo watermark insert-stream — KHÔNG đụng hot path
 * place-bet.
 *
 * KHÁC Keno (analysis bingo18-ops §3.2):
 * - `byPlayType` là FULL-BUCKET 38 bucket (không gian cược đóng) — vừa là phân bổ
 *   kiểu chơi, vừa là INPUT tính exposure CHÍNH XÁC per-outcome (216 trường hợp).
 * - KHÔNG có `numberFreq` (heatmap 6 ô dựng từ 3 record cùng key ở tầng đọc),
 *   KHÔNG `topCombos` (38 bucket là bảng phân bổ đầy đủ), KHÔNG `exposure` lưu doc
 *   (hàm thuần `computeBingo18Exposure` áp ở tầng đọc — bucket là RAW tuyến tính,
 *   biến đổi phi tuyến max-over-216 ở tầng đọc, đúng bài học Keno Risk #4).
 * - KHÔNG `topAccounts` (đã xoá khỏi doc ở p0-03) — top-K theo metric TÍCH LUỸ
 *   (`amount` cộng dồn) derive lúc ĐỌC từ collection riêng `bingo18_draw_account_stats`
 *   (`sort({amount:-1}).limit(K)`), xem `account-stats.ts` JSDoc.
 *
 * Xem `.cursor/analysis/bingo18-operations-risk-control.analysis.md` §3.2–3.4.
 */

import type {
  DrawBettingStatsBase,
  DrawBettingTotals,
  TenantBettingStat,
  TopAccountStat,
  OpsStatsConfigBase,
} from "@megawin/game-core/types";

export type {
  DrawBettingStatsBase,
  DrawBettingTotals,
  TenantBettingStat,
  TopAccountStat,
  OpsStatsConfigBase,
};

/**
 * Thống kê 1 bucket cược — 1 lựa chọn cụ thể của 1 kiểu chơi.
 *
 * Bingo 18 có đúng 38 bucket: singleNum 6 + doubleMatch 6 + tripleMatch.specific 6
 * + tripleMatch.any 1 + sumTotal 16 + bigSmallDraw 3.
 */
export interface Bingo18BucketStat {
  /** Tổng tiền cược vào bucket (VND). Công thức: Σ(board.betCount × unitPrice). */
  amount: number;
  /** Tổng số bộ cược (Σ board.betCount) — nhân với prize/unit ra liability bucket. */
  sets: number;
  /**
   * Số entry có ít nhất 1 board thuộc bucket này.
   *
   * XẤP XỈ cross-batch: mỗi board-hit `$inc +1` nên 1 entry có 2 board cùng bucket bị đếm
   * 2, và 1 entry trải qua 2 batch cũng đếm ở cả 2. Mô hình delta-only KHÔNG recompute nên
   * con số này cố định ở mức xấp xỉ — CHẤP NHẬN CÓ CHỦ ĐÍCH (analysis §5.4): sửa "cho đúng"
   * (distinct-entry) buộc đọc lại doc → phá delta-only. Chỉ dùng cho tỷ trọng tương đối
   * (concentration), KHÔNG phải đếm chính xác.
   */
  entries: number;
}

/**
 * Phân bố cược FULL-BUCKET theo kiểu chơi — nguồn của heatmap 6 ô, bar sumTotal,
 * side-bet split, VÀ input `computeBingo18Exposure` (rules/exposure.ts).
 *
 * Key số dùng string vì MongoDB serialize key thành string — giá trị là integer
 * 1-6 / 3-18 KHÔNG zero-padded (bingo18-game-rules #17).
 */
export interface Bingo18ByPlayType {
  /** Một số — key "1".."6". */
  singleNum: Record<string, Bingo18BucketStat>;
  /** Hai số trùng — key "1".."6". */
  doubleMatch: Record<string, Bingo18BucketStat>;
  /** Ba số trùng: specific key "1".."6" (×120), any 1 bucket (×20). */
  tripleMatch: {
    specific: Record<string, Bingo18BucketStat>;
    any: Bingo18BucketStat;
  };
  /** Cộng tổng — key "3".."18". Bucket "3"/"18" là nhân cao nhất (×120). */
  sumTotal: Record<string, Bingo18BucketStat>;
  /** Lớn/Hòa/Nhỏ — 3 hướng, key khớp `Bingo18BigSmallBet`. */
  bigSmallDraw: {
    big: Bingo18BucketStat;
    draw: Bingo18BucketStat;
    small: Bingo18BucketStat;
  };
}

/**
 * 1 vé nguy hiểm nhất theo potentialWin — "ai cầm vé to nhất".
 *
 * KHÁC Keno: `potentialWin` của Bingo 18 là EXACT `max_{216 outcome} payout(entry)`
 * (không phải Σ max per board — các board có thể loại trừ nhau, vd sumTotal 3 và 18
 * không cùng trúng). Tính bởi `computeBingo18EntryPotentialWin` (rules/exposure.ts).
 */
export interface Bingo18TopPotential {
  /** ID entry (hex string). */
  entryId: string;
  /** ID account sở hữu — dựng link outstanding khi điều tra. */
  accountId: string;
  /**
   * Username hiển thị (snapshot lúc cược) — cùng tên field với `TicketEntryDoc.username`.
   * Rỗng `""` khi entry không có snapshot — UI fallback `accountId`.
   */
  username: string;
  /** Tổng tiền cược của entry (VND). */
  amount: number;
  /** Worst-case entry này trả (VND) — exact max over 216 outcome. */
  potentialWin: number;
}

/**
 * Thống kê realtime 1 kỳ Bingo 18 — 1 document / draw, worker cập nhật async.
 *
 * Extends `DrawBettingStatsBase` (game-core) — thêm field đặc thù Bingo 18:
 * `byPlayType` (full-bucket 38 bucket), `topPotential` (exact 216).
 * Đọc luôn là `findOne({ drawId })` → O(1).
 */
export interface Bingo18DrawBettingStatsDoc extends DrawBettingStatsBase {
  /** MongoDB ObjectId. */
  _id: unknown;

  /** Phân bổ full-bucket (thay aggregatePlayTypeDistribution/DiceFrequency/TopCombos). */
  byPlayType: Bingo18ByPlayType;

  /**
   * Top entry nguy hiểm nhất theo potentialWin (exact), sort desc.
   * Cắt theo `ops.stats.topPotentialK`.
   */
  topPotential: Bingo18TopPotential[];
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface Bingo18DrawBettingStatsEntity extends Omit<Bingo18DrawBettingStatsDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
