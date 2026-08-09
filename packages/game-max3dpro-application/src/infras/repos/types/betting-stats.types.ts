/**
 * Types kết quả cho `BettingStatsRepository` + stats worker (Max 3D Pro).
 *
 * Tách theo rule `mongodb.mdc` §2 — result shape của repo không inline trong method.
 */

import type {
  DrawBettingTotals,
  Max3dproByPlayType,
  Max3dproTopPotential,
  Max3dproTripletStake,
  PlayMode,
  PlayType,
  TenantBettingStat,
  Triplet,
} from "@megawin/game-max3dpro/entities";

/** 1 entry tối thiểu để worker aggregate delta — projection từ `max3dpro_ticket_entries`. */
export interface EntryForStats {
  /** ObjectId hex string (watermark). */
  id: string;
  /** drawId dạng `YYYY-MM-DD.NNN`. */
  drawId: string;
  tenantId: string;
  accountId: string;
  /** Username hiển thị (snapshot từ entry) — field `username`, KHÔNG `accountName`. */
  username: string;
  /** Tổng tiền cược entry (VND). */
  amount: number;
  /** Mệnh giá 1 đơn vị dự thưởng (VND) — snapshot từ entry. */
  unitPrice: number;
  /** Hoa hồng đại lý (VND) — snapshot lúc place-bet. */
  commission: number;
  /** Boards trong entry. */
  boards: EntryBoardForStats[];
}

/** 1 board tối thiểu cho aggregate — subset `EntryBoardSnapshot` Max 3D Pro. */
export interface EntryBoardForStats {
  /** multiNumber | multiDigit. */
  playMode: PlayMode;
  /** straight (kiểu duy nhất của Pro). */
  playType: PlayType;
  /** Triplet đã chọn/sinh ra — input `expandSelectionToPairs` (multiNumber). */
  triplets: Triplet[];
  /** Chỉ multiDigit: 3 chữ số đầu — input expand Cartesian. */
  frontDigits?: number[];
  /** Chỉ multiDigit: 3 chữ số sau. */
  backDigits?: number[];
  /** Số ordered pairs của board (multiNumber: P(n,2)). */
  lineCount: number;
  /** Số lần cược nhân bội — fallback 1 cho data cũ. */
  betCount: number;
}

/**
 * Trạng thái hàng đợi 1 kỳ mà worker cần — projection SIÊU MỎNG từ stats doc.
 *
 * Worker delta-only (p0-01/p0-02) KHÔNG đọc baseline full doc: chỉ cần **cursor đọc**
 * insert-stream, không cần số liệu cũ. `undefined` khi doc mới (chưa áp batch nào).
 */
export interface DrawStatsCursor {
  /** drawId dạng `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Watermark: ObjectId hex string entry lớn nhất đã cộng. `undefined` khi doc mới. */
  lastEntryId: string | undefined;
}

/**
 * Delta counters của 1 kỳ trong 1 tick — mọi field là **lượng CỘNG THÊM**, không phải
 * giá trị tuyệt đối. Repo dịch thành `$inc` theo path cố định (p0-02).
 *
 * `byPlayType`/`tripletStakes`/`byTenant` là **partial** — chỉ chứa key thực sự có delta
 * trong tick để `$inc` không sinh field rác cho triplet/tenant chưa chạm.
 */
export interface Max3dproStatsDelta {
  /** Δ `totals` — mọi field cộng thêm. */
  totals: DrawBettingTotals;
  /** Δ theo play mode — 2 slot cố định (multiNumber/multiDigit), key có delta. */
  byPlayType: Partial<Max3dproByPlayType>;
  /** Δ stake theo triplet distinct — chỉ triplet xuất hiện trong tick. */
  tripletStakes: Record<string, Max3dproTripletStake>;
  /** Δ theo tenant — chỉ tenant có cược trong tick. */
  byTenant: Record<string, TenantBettingStat>;
  /**
   * Entry mới trong tick để merge vào `topPotential`.
   *
   * KHÁC các field trên: mảng cần sort+cắt K nên KHÔNG `$inc` được → repo dùng
   * `$push` + `$sort` + `$slice` (Mongo tự làm phía server, app không đọc mảng cũ).
   */
  topPotential: Max3dproTopPotential[];
}

/**
 * Delta 1 cặp ORDERED trong 1 tick — tổng + breakdown account.
 *
 * `pairKey = "${first}>${second}"` (⚠️ ORDERED — KHÔNG sort). Worker ghi
 * `max3dpro_draw_pair_stats` (counter) + `max3dpro_draw_pair_accounts` (per-account) bằng
 * `$inc` upsert. `first`/`second` lưu tách để đọc không phải parse `pairKey`.
 */
export interface Max3dproPairStatsDelta {
  drawId: string;
  /** Khoá cặp ORDERED — bất biến theo cặp. */
  pairKey: string;
  /** Bộ ba thứ nhất (đúng thứ tự cược). */
  first: string;
  /** Bộ ba thứ hai (đúng thứ tự cược). */
  second: string;
  /** Δ Σ betCount vào chiều này — luôn ≥ 0. */
  units: number;
  /** Δ tổng tiền vào chiều này (VND) — luôn ≥ 0. */
  amount: number;
  /** Δ theo account (accountId → delta). */
  accounts: Map<string, Max3dproPairAccountDelta>;
}

/**
 * Delta 1 account trong 1 cặp ORDERED — worker ghi `max3dpro_draw_pair_accounts` bằng
 * `$inc` upsert. `units`/`amount` luôn ≥ 0 (void lọc tại nguồn).
 */
export interface Max3dproPairAccountDelta {
  accountId: string;
  /** Δ Σ betCount account này vào cặp. */
  units: number;
  /** Δ tổng tiền account này vào cặp (VND). */
  amount: number;
}

/**
 * Delta tích luỹ 1 account trong 1 kỳ — ghi `max3dpro_draw_account_stats` bằng `$inc`
 * upsert. Nguồn CHÍNH XÁC cho `topAccounts` (thay mảng top-K drift — p0-01 §1).
 */
export interface Max3dproAccountStatsDelta {
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
