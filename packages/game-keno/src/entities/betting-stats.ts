/**
 * Keno – Draw Betting Stats (pre-aggregated realtime stats)
 *
 * Collection: keno_draw_betting_stats — 1 document / draw.
 *
 * Thay toàn bộ ops aggregation on-demand (aggregateOpsSummary / NumberFrequency /
 * PlayTypeDistribution / TenantBreakdown / TopCombos) bằng findOne O(1). Worker
 * mini-batch cập nhật async theo watermark insert-stream — KHÔNG đụng hot path
 * place-bet.
 *
 * Xem `.cursor/analysis/keno-operations-risk-control.analysis.md` §3.2–3.4, 3.7.
 */

import type {
  DeltaAccumulatedDoc,
  DrawBettingStatsBase,
  DrawBettingTotals,
  OpsStatsConfig,
  TenantBettingStat,
  TopAccountStat,
} from "@megawin/game-core/types";

import type { KenoPlayType } from "./enums";

export type {
  DeltaAccumulatedDoc,
  DrawBettingStatsBase,
  DrawBettingTotals,
  OpsStatsConfig,
  TenantBettingStat,
  TopAccountStat,
};

/** Thống kê tiền/bộ cược của 1 kiểu chơi (basic pickN hoặc 1 hướng side bet). */
export interface KenoPlayTypeStat {
  /** Tổng tiền cược vào kiểu chơi này (VND). Công thức: Σ(board.betCount × unitPrice). */
  amount: number;
  /** Tổng số bộ cược `Σ(board.betCount)` của kiểu chơi này (KHÔNG phải số board). */
  sets: number;
}

/**
 * Phân bố cược theo kiểu chơi — nguồn của rule `sidebet_skew` (p0-06).
 *
 * Side bet TÁCH HƯỚNG CƯỢC (bigSmall.big/small/draw, evenOdd.*) để nhìn lệch
 * một phía là thấy ngay. Key hướng khớp `KenoBigSmallBet`/`KenoEvenOddBet`.
 */
export interface KenoByPlayType {
  pick1: KenoPlayTypeStat;
  pick2: KenoPlayTypeStat;
  pick3: KenoPlayTypeStat;
  pick4: KenoPlayTypeStat;
  pick5: KenoPlayTypeStat;
  pick6: KenoPlayTypeStat;
  pick7: KenoPlayTypeStat;
  pick8: KenoPlayTypeStat;
  pick9: KenoPlayTypeStat;
  pick10: KenoPlayTypeStat;
  /** Lớn/Nhỏ tách 3 hướng: big / small / draw (hoà). */
  bigSmall: { big: KenoPlayTypeStat; small: KenoPlayTypeStat; draw: KenoPlayTypeStat };
  /** Chẵn/Lẻ tách 5 hướng theo `KenoEvenOddBet`. */
  evenOdd: {
    even: KenoPlayTypeStat;
    even1112: KenoPlayTypeStat;
    draw: KenoPlayTypeStat;
    odd1112: KenoPlayTypeStat;
    odd: KenoPlayTypeStat;
  };
}

/** Thống kê 1 số (01–80) trên heatmap — hai lớp: dòng tiền & liability. */
export interface KenoNumberStat {
  /** Số bộ cược basic chứa số này: `Σ(board.betCount)` các board basic chứa số. */
  sets: number;
  /**
   * Dòng tiền quy cho số này (VND): Σ(board.betCount × unitPrice) của MỌI board
   * basic chứa số này. Không chia — 1 số xuất hiện trong board nào thì cộng trọn
   * tiền board đó (sửa lỗi chia đơn giản hoá của pipeline cũ).
   */
  amount: number;
}

/**
 * 1 combo bị cược trùng nhiều — phát hiện syndicate.
 *
 * **Shape DTO (đọc), KHÔNG phải field trong stats doc.** Từ p2-01 §3.5 `topCombos` được
 * derive lúc đọc từ `keno_draw_combo_stats` (`sort({sets:-1}).limit(K)`) thay vì lưu mảng
 * top-K trong stats doc — mảng đó bị drift vì top-K theo metric TÍCH LUỸ không thể seed
 * lại chính xác (phần rơi khỏi top-K mất lịch sử).
 *
 * `accounts` = số account DISTINCT cùng cược combo này. 1 combo × nhiều account
 * khác nhau = tín hiệu nghi vấn syndicate / share tips.
 */
export interface KenoTopCombo {
  /** Kiểu chơi basic của combo (thường pick cao 8/9/10). */
  playType: KenoPlayType;
  /** Danh sách số "01".."80" đã sort tăng dần. */
  numbers: string[];
  /** Tổng bộ cược combo này (Σ betCount). */
  sets: number;
  /** Số account distinct cược combo này. */
  accounts: number;
  /** Tổng tiền vào combo này (VND). */
  amount: number;
}

/** Proxy exposure — worst-case liability của kỳ (analysis §3.4). */
export interface KenoExposure {
  /**
   * Worst-case RAW theo từng kiểu chơi (VND): Σ(units × maxPrize[playType]).
   *
   * LƯU RAW (CHƯA cap). Cap `maxPerDraw` cho pick8/9/10 chỉ áp lúc BUILD RESPONSE /
   * eval alert qua `capExposureByPlayType` (analysis §3.4).
   */
  worstCaseByPlayType: Record<string, number>;
  /** Tổng worst-case RAW toàn kỳ (VND) = Σ worstCaseByPlayType (CHƯA cap). */
  worstCaseTotal: number;
  /** Số bộ cược trọn bậc cao (trúng hết) — so `maxSetsForFixed` để biết cap có kích hoạt. */
  capSets: { pick8: number; pick9: number; pick10: number };
}

/** 1 vé nguy hiểm nhất theo potentialWin — "ai cầm vé to nhất". */
export interface KenoTopPotential {
  /** ID entry (hex string). */
  entryId: string;
  /** ID account sở hữu — link tới hồ sơ tài khoản khi cần. */
  accountId: string;
  /**
   * Username hiển thị (snapshot lúc cược) — cùng tên field với `TicketEntryDoc.username`
   * để nhất quán toàn hệ thống. Ưu tiên hiển thị trước `accountId`.
   * Rỗng `""` khi entry không có username snapshot — UI fallback về `accountId`.
   */
  username: string;
  /** Tổng tiền cược của entry (VND). */
  amount: number;
  /** Tổng potentialWin của entry (VND) — worst-case entry này trả. */
  potentialWin: number;
}

/**
 * Thống kê realtime 1 kỳ Keno — 1 document / draw, worker cập nhật async.
 *
 * Extends `DrawBettingStatsBase` (trừ `lastEntryId` — siết type, xem cuối JSDoc) — thêm
 * field đặc thù Keno: `byPlayType` (tách hướng side bet), `numberFreq` (heatmap),
 * `exposure`, `topPotential`. Đọc luôn là `findOne({ drawId })` → O(1).
 *
 * ## Vì sao KHÔNG có `topAccounts` và `topCombos` trong doc? (p2-01 §3.5)
 *
 * Cả hai là top-K theo metric **TÍCH LUỸ** (`amount`/`sets` cộng dồn). Lưu mảng top-K
 * trong doc buộc worker seed lại từ doc mỗi tick, nhưng doc chỉ có top-K → phần tử rơi
 * khỏi top-K **mất toàn bộ lịch sử** → drift tỷ lệ thuận số người chơi. Nay derive lúc đọc
 * từ collection tích luỹ chính xác:
 * - `topAccounts` ← `keno_draw_account_stats` (`sort({amount:-1}).limit(K)`)
 * - `topCombos` ← `keno_draw_combo_stats` (`sort({sets:-1}).limit(K)`)
 *
 * `topPotential` VẪN nằm trong doc vì `potentialWin` là metric **BẤT BIẾN per-entry** —
 * entry rớt khỏi top-K thì mãi mãi không cần quay lại, nên top-K an toàn (không drift).
 *
 * Từ 02/08/2026 `topAccounts` cũng không còn ở base nữa (3 game chưa port tự khai) →
 * không cần `Omit` field đó ở đây.
 *
 * ## Watermark & idempotent
 *
 * `totals`/`byPlayType`/`numberFreq`/`byTenant`/`exposure` cộng bằng `$inc` theo path cùng
 * `$set lastEntryId` trong 1 lệnh → nguyên tử, idempotent (xem {@link DeltaAccumulatedDoc}).
 * `lastEntryId` siết về `string` (base khai `unknown` cho tương thích 3 game chưa migrate).
 */
export interface KenoDrawBettingStatsDoc extends Omit<DrawBettingStatsBase, "lastEntryId">, DeltaAccumulatedDoc {
  /** MongoDB ObjectId. */
  _id: unknown;

  /** Phân bố kiểu chơi (thay aggregatePlayTypeDistribution). */
  byPlayType: KenoByPlayType;

  /**
   * Heatmap 80 số cố định (thay aggregateNumberFrequency). Key "01".."80".
   * Chỉ tính từ board basic (side bet không có numbers).
   */
  numberFreq: Record<string, KenoNumberStat>;

  /** Proxy exposure worst-case (analysis §3.4). */
  exposure: KenoExposure;

  /**
   * Top entry nguy hiểm nhất theo potentialWin, sort desc.
   * Cắt theo `ops.stats.topPotentialK`. An toàn với top-K vì `potentialWin` bất biến.
   */
  topPotential: KenoTopPotential[];
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface KenoDrawBettingStatsEntity extends Omit<KenoDrawBettingStatsDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
