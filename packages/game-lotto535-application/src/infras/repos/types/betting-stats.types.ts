/**
 * Types kết quả cho stats repos (betting-stats/number-stats/account-stats/combo-stats).
 *
 * Tách theo rule `mongodb.mdc` §2 — result shape của repo không inline trong method.
 * Port từ Power 6/55 (`packages/game-power655-application/src/infras/repos/types/betting-stats.types.ts`)
 * — KHÁC Power 6/55: `EntryBoardForStats` thêm `specialNumbers` (Lotto 5/35 luôn có 2
 * chiều số), `NumberStatsDelta`/`ComboStatsDelta` thêm chiều `kind`/`specialNumbers`.
 */

import type {
  DrawBettingTotals,
  Lotto535NumberKind,
  Lotto535PlayTypeStat,
  Lotto535StatsPlayKey,
  Lotto535TopPotential,
  PlayType,
  TenantBettingStat,
} from "@megawin/game-lotto535/entities";

/** 1 entry tối thiểu để worker aggregate delta — projection từ `lotto535TicketEntries`. */
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

/**
 * 1 board tối thiểu cho aggregate — KHÔNG chứa lines đã expand.
 *
 * KHÁC Power 6/55: thêm `specialNumbers` — Lotto 5/35 luôn có 2 chiều số (main + special),
 * số lượng phụ thuộc `playType` (xem `EntryBoardSnapshot`).
 */
export interface EntryBoardForStats {
  playType: string;
  /** Số chính đã chọn ("01".."35") — KHÔNG expand thành lines. */
  mainNumbers: string[];
  /** Số đặc biệt đã chọn ("01".."12") — KHÔNG expand thành lines. */
  specialNumbers: string[];
  /** Số line sau khi expand. */
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
 * `$inc` không sinh field rác cho 13 key / N tenant khi chỉ 1–2 cái thay đổi.
 */
export interface DrawStatsDelta {
  /** Δ `totals` — mọi field cộng thêm. */
  totals: DrawBettingTotals;
  /** Δ theo play type — chỉ key có phát sinh (13 key cố định theo `Lotto535StatsPlayKey`). */
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
  topPotential: Lotto535TopPotential[];
}

/**
 * Δ `byPlayType` — partial, chỉ key thực sự có delta trong tick.
 *
 * Dùng `Partial<Record<...>>` thay full record vì 1 tick thường chỉ chạm vài play type;
 * ghi `$inc` cho cả 13 slot là write amplification vô ích.
 */
export type PartialPlayTypeDelta = Partial<Record<Lotto535StatsPlayKey, Lotto535PlayTypeStat>>;

/**
 * Delta tần suất 1 số (chính hoặc đặc biệt) trong 1 kỳ — ghi `lotto535_draw_number_stats`
 * bằng `$inc` upsert.
 *
 * Đếm theo `board.mainNumbers`/`board.specialNumbers` (KHÔNG expand lines) — xem JSDoc
 * `Lotto535DrawNumberStatsDoc`. Thêm chiều `kind` so với Power 6/55 (2 không gian số).
 */
export interface NumberStatsDelta {
  drawId: string;
  /** Chiều số — main hay special. */
  kind: Lotto535NumberKind;
  /** Số, zero-padded theo `kind`. */
  number: string;
  /** Δ số bộ cược `Σ(board.expandedLines × betCount)` chứa số này. */
  sets: number;
  /** Δ tiền quy cho số này (VND) — cộng trọn tiền board, KHÔNG chia. */
  amount: number;
  /** Δ số board chứa số này (KHÔNG nhân betCount). */
  boards: number;
}

/**
 * Delta tích luỹ 1 account trong 1 kỳ — ghi `lotto535_draw_account_stats` bằng `$inc` upsert.
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
 * `lotto535_draw_combo_accounts` bằng `$inc` upsert. `sets`/`amount` luôn ≥ 0.
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
 * `comboKey` build bằng `buildComboKey(playType, mainNumbers, specialNumbers)` — KHÁC
 * Power 6/55: thêm chiều `specialNumbers` (Lotto 5/35 luôn có main + special).
 */
export interface ComboStatsDelta {
  /** Khoá combo ổn định. */
  comboKey: string;
  drawId: string;
  /** Play type của combo — lưu vào doc lúc insert. */
  playType: PlayType;
  /** Số chính đã sort — lưu vào doc lúc insert. */
  mainNumbers: string[];
  /** Số đặc biệt đã sort — lưu vào doc lúc insert. */
  specialNumbers: string[];
  /** Δ tổng số bộ (Σ expandedLines × betCount) — luôn ≥ 0. */
  sets: number;
  /** Δ tổng tiền (VND) — luôn ≥ 0. */
  amount: number;
  /** Δ theo account (accountId → delta). */
  accounts: Map<string, ComboAccountDelta>;
}
