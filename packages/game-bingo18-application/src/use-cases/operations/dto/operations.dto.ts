/**
 * Bingo 18 – Operations Dashboard DTOs
 *
 * Mỗi endpoint trả về 1 phần nhỏ, lazy-load trên UI.
 *
 * Bingo 18 khác biệt so với các game khác:
 *   - KHÔNG có Jackpot — financial chỉ có profit = revenue - prizes - commission
 *   - Cách chơi cơ bản: singleNum, doubleMatch, tripleMatch (3 loại)
 *   - Side bets: sumTotal (tổng 3-18), bigSmallDraw (lớn/hòa/nhỏ)
 *   - 3 xúc xắc (1-6), tần suất cao ~160 kỳ/ngày
 *   - TripleKind: specific (1.2tr) vs any (200k) — concept riêng Bingo 18
 */

import type { Bingo18PlayType, Bingo18TripleKind } from "@megawin/game-bingo18/entities";

// ─────────────────────────────────────────────
// GetOpsSummary
// ─────────────────────────────────────────────

export interface OpsQueryInput {
  /** Ngày tài chính, format YYYY-MM-DD. Mặc định hôm nay theo giờ VN. */
  financialDate?: string;
  /** Lọc theo drawId cụ thể (optional). */
  drawId?: string;
}

export interface OpsSummaryOutput {
  /** Ngày tài chính đang xem. */
  financialDate: string;
  /** Tổng doanh thu (VND). Công thức: Σ(entry.amount). */
  totalRevenue: number;
  /** Tổng entries (= số vé tham gia kỳ). */
  totalEntries: number;
  /**
   * Tổng boards cơ bản (singleNum + doubleMatch + tripleMatch).
   * Bingo 18 tối đa 6 boards/vé.
   */
  totalBoards: number;
  /** Tổng side bets (sumTotal + bigSmallDraw). */
  totalSideBets: number;
  /** Số người chơi unique (distinct accountId). */
  totalPlayers: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
}

// ─────────────────────────────────────────────
// GetTenantBreakdown
// ─────────────────────────────────────────────

export interface TenantBreakdownItem {
  /** Mã đại lý. */
  tenantId: string;
  /** Số entries. */
  entries: number;
  /** Số boards cơ bản. */
  boards: number;
  /** Số side bets. */
  sideBets: number;
  /** Số người chơi unique. */
  players: number;
  /** Doanh thu (VND). */
  revenue: number;
  /** Hoa hồng (VND). */
  commission: number;
}

export interface TenantBreakdownOutput {
  financialDate: string;
  tenants: TenantBreakdownItem[];
}

// ─────────────────────────────────────────────
// GetDiceFrequency
// Bingo 18: 6 mặt xúc xắc (1-6), đơn giản hơn Keno rất nhiều (6 vs 80 số).
// Chỉ thống kê từ basic boards: singleNum + doubleMatch (có số cụ thể).
// tripleMatch-any không có số cụ thể → không đưa vào heatmap.
// ─────────────────────────────────────────────

export interface DiceFrequencyItem {
  /**
   * Mặt xúc xắc (1-6).
   * Số nguyên, không zero-padded (khác Keno dùng string "01"-"80").
   */
  diceValue: number;
  /** Số boards chọn mặt xúc xắc này. */
  count: number;
  /** Số entries distinct có board chọn mặt này. */
  entries: number;
}

export interface DiceFrequencyOutput {
  financialDate: string;
  /** Tần suất 6 mặt xúc xắc (1-6), đủ 6 giá trị kể cả count=0. */
  dice: DiceFrequencyItem[];
}

// ─────────────────────────────────────────────
// GetPlayTypeDistribution
// Bingo 18: 5 cách chơi → 6 rows (tripleMatch tách specific/any).
// ─────────────────────────────────────────────

export interface PlayTypeDistributionItem {
  /** Kiểu chơi (singleNum, doubleMatch, tripleMatch, sumTotal, bigSmallDraw). */
  playType: Bingo18PlayType;
  /**
   * Phân loại triple — chỉ có với tripleMatch.
   * "specific": chọn số cụ thể (giải 1.2tr). "any": bất kỳ bộ 3 (giải 200k).
   */
  tripleKind?: Bingo18TripleKind;
  /** Số selections (boards hoặc side bets) kiểu này. */
  selectionCount: number;
  /** Số entries có ít nhất 1 selection kiểu này. */
  entryCount: number;
}

export interface PlayTypeDistributionOutput {
  financialDate: string;
  distribution: PlayTypeDistributionItem[];
}
