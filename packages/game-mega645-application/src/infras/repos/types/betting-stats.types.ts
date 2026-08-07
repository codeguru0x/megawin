/**
 * Types kết quả cho stats repos (betting-stats/number-stats/account-stats/combo-stats).
 *
 * Tách theo rule `mongodb.mdc` §2 — result shape của repo không inline trong method.
 * Port từ Power 6/55 (`packages/game-power655-application/src/infras/repos/types/betting-stats.types.ts`).
 */

import type {
  DrawBettingTotals,
  Mega645PlayTypeStat,
  Mega645TopPotential,
  TenantBettingStat,
  PlayType,
} from "@megawin/game-mega645/entities";

/** 1 entry tối thiểu để worker aggregate delta — projection từ `mega645_ticket_entries`. */
export interface EntryForStats {
  /** ObjectId hex string (watermark). */
  id: string;
  /** drawId dạng `YYYY-MM-DD.NNN`. */
  drawId: string;
  tenantId: string;
  accountId: string;
  /** Username hiển thị (snapshot từ entry) — dùng làm `username` cho combo/account stats. */
  username: string;
  /** Tổng tiền cược entry (VND). */
  amount: number;
  /** Tổng đơn vị cược của entry = Σ(board.expandedLines × betCount) — nguồn `totals.sets`. */
  betUnitCount: number;
  /** Hoa hồng đại lý (VND) — snapshot lúc place-bet. */
  commission: number;
  /** Boards trong entry (`entrySummary.boards`). */
  boards: EntryBoardForStats[];
}

/** 1 board tối thiểu cho aggregate — KHÔNG chứa lines đã expand (Bao 18 có 18.564 lines). */
export interface EntryBoardForStats {
  playType: string;
  /** Số đã chọn ("01".."45") — KHÔNG expand thành lines. */
  numbers: string[];
  /** Số line sau khi expand (standard=1, bao5=40, bao7-18=C(N,6)). */
  expandedLines: number;
  /** Số lần cược nhân bội. */
  betCount: number;
}

/**
 * Trạng thái hàng đợi 1 kỳ mà worker cần — projection SIÊU MỎNG từ stats doc.
 *
 * Accumulator là delta-only nên chỉ cần **cursor đọc**, không cần số liệu cũ
 * (tránh đọc baseline lớn × D kỳ mỗi tick, xem `betting-stats-repo.ts`).
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
 * `byPlayType`/`byTenant` là **partial** — chỉ chứa key thực sự có delta trong tick, để
 * `$inc` không sinh field rác cho 12 play type / N tenant khi chỉ 1–2 cái thay đổi.
 */
export interface DrawStatsDelta {
  /** Δ `totals` — mọi field cộng thêm. */
  totals: DrawBettingTotals;
  /** Δ theo play type — chỉ key có phát sinh (12 key cố định theo `PlayType`). */
  byPlayType: PartialPlayTypeDelta;
  /** Δ theo tenant — chỉ tenant có cược trong tick. */
  byTenant: Record<string, TenantBettingStat>;
  /**
   * Δ worst-case giải cố định (VND) = Σ(entry.betUnitCount × tier1) trong tick.
   * KHÔNG có phần jackpot ở đây — đọc snapshot pool lúc build response (analysis §3.6).
   */
  fixedWorstCase: number;
  /**
   * Entry mới trong tick để merge vào `topPotential`.
   *
   * KHÁC các field trên: `topPotential` là mảng cần sort+cắt K nên KHÔNG `$inc` được →
   * repo dùng `$push` + `$sort` + `$slice` (Mongo tự làm phía server, app không đọc mảng cũ).
   */
  topPotential: Mega645TopPotential[];
}

/**
 * Δ `byPlayType` — partial, chỉ key thực sự có delta trong tick.
 *
 * Dùng `Partial<Record<...>>` thay full record vì 1 tick thường chỉ chạm vài play type;
 * ghi `$inc` cho cả 12 slot là write amplification vô ích.
 */
export type PartialPlayTypeDelta = Partial<Record<PlayType, Mega645PlayTypeStat>>;

/**
 * Delta tần suất 1 số trong 1 kỳ — ghi `mega645_draw_number_stats` bằng `$inc` upsert.
 *
 * Đếm theo `board.numbers` (KHÔNG expand lines) — xem JSDoc `Mega645DrawNumberStatsDoc`.
 */
export interface NumberStatsDelta {
  drawId: string;
  /** Số chính, zero-padded "01".."45". */
  number: string;
  /** Δ số bộ cược `Σ(board.expandedLines × betCount)` chứa số này. */
  sets: number;
  /** Δ tiền quy cho số này (VND) — cộng trọn tiền board, KHÔNG chia. */
  amount: number;
  /** Δ số board chứa số này (KHÔNG nhân betCount). */
  boards: number;
}

/**
 * Delta tích luỹ 1 account trong 1 kỳ — ghi `mega645_draw_account_stats` bằng `$inc` upsert.
 *
 * Nguồn CHÍNH XÁC cho `topAccounts` (không lưu mảng top-K trong stats doc — tránh drift).
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
  /** Δ số bộ cược `Σ(board.expandedLines × betCount)` (KHÔNG phải số board). */
  sets: number;
}

/**
 * Delta 1 account trong 1 combo — gom trong RAM 1 tick, worker ghi
 * `mega645_draw_combo_accounts` bằng `$inc` upsert. `sets`/`amount` luôn ≥ 0.
 */
export interface ComboAccountDelta {
  accountId: string;
  username: string;
  sets: number;
  amount: number;
}

/**
 * Delta 1 combo (board) trong 1 tick — tổng + breakdown account.
 *
 * `comboKey = `${playType}:${sortedNumbers.join(",")}``. Track MỌI play type (không chỉ
 * cappable — Mega 6/45 không có cap) vì doc chỉ sinh cho combo thực sự có người cược.
 */
export interface ComboStatsDelta {
  /** Khoá combo ổn định. */
  comboKey: string;
  drawId: string;
  /** Play type của combo — lưu vào doc lúc insert. */
  playType: PlayType;
  /** Bộ số đã sort — lưu vào doc lúc insert. */
  numbers: string[];
  /** Δ tổng số bộ (Σ expandedLines × betCount) — luôn ≥ 0. */
  sets: number;
  /** Δ tổng tiền (VND) — luôn ≥ 0. */
  amount: number;
  /** Δ theo account (accountId → delta). */
  accounts: Map<string, ComboAccountDelta>;
}
