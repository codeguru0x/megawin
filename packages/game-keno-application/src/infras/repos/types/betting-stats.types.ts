/**
 * Types kết quả cho `BettingStatsRepository`.
 *
 * Tách theo rule `mongodb.mdc` §2 — result shape của repo không inline trong method.
 */

import type {
  DrawBettingTotals,
  KenoByPlayType,
  KenoNumberStat,
  KenoPlayType,
  KenoTopPotential,
  TenantBettingStat,
} from "@megawin/game-keno/entities";

/** 1 entry tối thiểu để worker aggregate delta — projection từ `keno_ticket_entries`. */
export interface EntryForStats {
  /** ObjectId hex string (watermark). */
  id: string;
  /** drawId dạng `YYYY-MM-DD.NNN`. */
  drawId: string;
  tenantId: string;
  accountId: string;
  /** Username hiển thị (snapshot từ entry) — dùng làm `username` cho combo stats. */
  username: string;
  /** Tổng tiền cược entry (VND). */
  amount: number;
  /** Hoa hồng đại lý (VND) — snapshot lúc place-bet. */
  commission: number;
  /** Boards trong entry (basic + side bet đã merge). */
  boards: EntryBoardForStats[];
}

/** 1 board tối thiểu cho aggregate. */
export interface EntryBoardForStats {
  playType: string;
  /** Số "01".."80" — chỉ có ở board basic. */
  numbers?: string[];
  /** Hướng side bet — chỉ có ở board bigSmall/evenOdd. */
  bet?: string;
  /** Số lần cược nhân bội của board. */
  betCount: number;
}

/**
 * Trạng thái hàng đợi 1 kỳ mà worker cần — projection SIÊU MỎNG từ stats doc.
 *
 * Từ p2-01 §3.5 worker KHÔNG còn đọc baseline full doc (33KB × D kỳ × 6 lần/phút kể cả
 * khi không ai cược — R7). Accumulator là delta-only nên chỉ cần **cursor đọc**, không cần
 * số liệu cũ.
 */
export interface DrawStatsCursor {
  /** drawId dạng `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Watermark: ObjectId hex string entry lớn nhất đã cộng. `undefined` khi doc mới. */
  lastEntryId: string | undefined;
}

/**
 * Delta counters của 1 kỳ trong 1 tick — mọi field là **lượng CỘNG THÊM**, không phải
 * giá trị tuyệt đối.
 *
 * Repo dịch shape này thành `$inc` theo path cố định (p2-01 B1) → write amplification
 * giảm từ ~35× xuống ~1×, và loại bỏ nhu cầu đọc baseline (R6/R7).
 *
 * `byPlayType`/`numberFreq`/`byTenant`/`worstCaseByPlayType` là **partial** — chỉ chứa key
 * thực sự có delta trong tick, để `$inc` không sinh field rác cho 80 số / 15 play type khi
 * chỉ 1–2 cái thay đổi.
 */
export interface DrawStatsDelta {
  /** Δ `totals` — mọi field cộng thêm. */
  totals: DrawBettingTotals;
  /** Δ theo play type — chỉ key có phát sinh (partial sâu 2 tầng cho side bet). */
  byPlayType: PartialPlayTypeDelta;
  /** Δ heatmap theo số ("01".."80") — chỉ số xuất hiện trong tick. */
  numberFreq: Record<string, KenoNumberStat>;
  /** Δ theo tenant — chỉ tenant có cược trong tick. */
  byTenant: Record<string, TenantBettingStat>;
  /** Δ worst-case RAW theo play type (VND, CHƯA cap). */
  worstCaseByPlayType: Record<string, number>;
  /** Δ tổng worst-case RAW (VND) = Σ trên. */
  worstCaseTotal: number;
  /** Δ số bộ trọn bậc cao — cộng thêm. */
  capSets: { pick8: number; pick9: number; pick10: number };
  /**
   * Entry mới trong tick để merge vào `topPotential`.
   *
   * KHÁC các field trên: `topPotential` là mảng cần sort+cắt K nên KHÔNG `$inc` được →
   * repo dùng `$push` + `$sort` + `$slice` (Mongo tự làm phía server, app không đọc mảng cũ).
   */
  topPotential: KenoTopPotential[];
}

/**
 * Δ `byPlayType` — partial ở cả tầng ngoài và tầng hướng side bet.
 *
 * Dùng `Partial` thay full `KenoByPlayType` vì 1 tick thường chỉ chạm vài play type; ghi
 * `$inc` cho cả 15 slot là write amplification vô ích.
 */
export type PartialPlayTypeDelta = {
  [K in keyof KenoByPlayType]?: KenoByPlayType[K] extends infer V
    ? V extends { amount: number }
      ? V
      : Partial<V>
    : never;
};

/**
 * Delta 1 account trong 1 combo — gom trong RAM 1 tick, worker ghi
 * `keno_draw_combo_accounts` bằng `$inc` upsert. `sets`/`amount` luôn ≥ 0 (void lọc tại
 * nguồn — không còn "trừ bù").
 */
export interface ComboAccountDelta {
  accountId: string;
  username: string;
  sets: number;
  amount: number;
}

/**
 * Delta 1 combo trong 1 tick — tổng + breakdown account.
 *
 * `comboKey = `${playType}:${sortedNumbers.join(",")}``. Từ p2-01 §3.5 track **MỌI** play
 * type (không chỉ cappable) vì doc chỉ sinh cho combo thực sự có người cược → `topCombos`
 * chính xác tuyệt đối. `playType`/`numbers` lưu tách để đọc không phải parse `comboKey`.
 */
export interface ComboStatsDelta {
  /** Khoá combo ổn định. */
  comboKey: string;
  drawId: string;
  /** Play type của combo — lưu vào doc lúc insert. */
  playType: KenoPlayType;
  /** Bộ số đã sort — lưu vào doc lúc insert. */
  numbers: string[];
  /** Δ tổng số bộ (Σ betCount) — luôn ≥ 0. */
  sets: number;
  /** Δ tổng tiền (VND) — luôn ≥ 0. */
  amount: number;
  /** Δ theo account (accountId → delta). */
  accounts: Map<string, ComboAccountDelta>;
}

/**
 * Delta tích luỹ 1 account trong 1 kỳ — ghi `keno_draw_account_stats` bằng `$inc` upsert.
 *
 * Nguồn CHÍNH XÁC cho `topAccounts` (thay mảng top-K drift trong stats doc — p2-01 R5).
 */
export interface AccountStatsDelta {
  drawId: string;
  accountId: string;
  /** Username snapshot mới nhất trong tick — field duy nhất dùng `$set`. */
  username: string;
  /** Δ tổng tiền cược (VND). */
  amount: number;
  /** Δ số entry. */
  entries: number;
  /** Δ số bộ cược `Σ(board.betCount)` (KHÔNG phải số board). */
  sets: number;
}
