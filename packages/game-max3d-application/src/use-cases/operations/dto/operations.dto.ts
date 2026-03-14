/**
 * Max 3D – Operations Dashboard DTOs
 *
 * Tách riêng DTO cho các use case operations dashboard.
 * Mỗi endpoint trả về 1 phần nhỏ, lazy-load trên UI.
 *
 * Max 3D KHÔNG CÓ Jackpot, KHÔNG CÓ companyRate.
 * Financial model: profit = revenue - fixedPrizes - agentCommission.
 */

import type { PlayMode, PlayType } from "@megawin/game-max3d/entities";

// ─────────────────────────────────────────────
// GetOperationsSummary
// ─────────────────────────────────────────────

export interface GetOpsSummaryInput {
  /** Ngày tài chính, format YYYY-MM-DD. Mặc định hôm nay. */
  financialDate?: string;
  /** Lọc theo drawId cụ thể (optional). */
  drawId?: string;
}

export interface OpsSummaryOutput {
  /** Ngày tài chính đang xem. */
  financialDate: string;
  /** Tổng doanh thu (VND). */
  totalRevenue: number;
  /** Tổng entries. */
  totalEntries: number;
  /**
   * Tổng lines = Σ(entry.lineCount).
   * Với Max 3D: basic straight/quickPick = 1 line/board, combo3 = 3, combo6 = 6, plus = 1.
   */
  totalLines: number;
  /** Số người chơi unique. */
  totalPlayers: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
}

// ─────────────────────────────────────────────
// GetTenantBreakdown
// ─────────────────────────────────────────────

export interface GetTenantBreakdownInput {
  financialDate?: string;
  drawId?: string;
}

export interface TenantBreakdownItem {
  /** ID đại lý. */
  tenantId: string;
  /** Số entries. */
  entries: number;
  /** Tổng lines. */
  lines: number;
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
// GetTripletFrequency
// ─────────────────────────────────────────────

export interface GetTripletFrequencyInput {
  financialDate?: string;
  drawId?: string;
  /** Số bộ ba phổ biến nhất cần trả về. Mặc định 20, tối đa 50. */
  limit?: number;
}

export interface TripletFrequencyItem {
  /** Bộ ba số (zero-padded "000"-"999"). */
  triplet: string;
  /** Số boards/lines chứa bộ ba này. */
  count: number;
  /** Tổng tiền cược xấp xỉ (VND). */
  revenue: number;
}

export interface TripletFrequencyOutput {
  financialDate: string;
  triplets: TripletFrequencyItem[];
}

// ─────────────────────────────────────────────
// GetPlayTypeDistribution
// ─────────────────────────────────────────────

export interface GetPlayTypeDistributionInput {
  financialDate?: string;
  drawId?: string;
}

export interface PlayTypeDistributionItem {
  /** Cách chơi: basic / plus. */
  playMode: PlayMode;
  /** Kiểu chơi: straight / combo3 / combo6 / quickPick. */
  playType: PlayType;
  /** Số boards thuộc cặp (playMode, playType) này. */
  boardCount: number;
  /** Tổng lines của các boards đó. */
  lineCount: number;
  /** Số entries distinct chứa ít nhất 1 board kiểu này. */
  entryCount: number;
  /** Tổng doanh thu xấp xỉ (VND). */
  revenue: number;
}

export interface PlayTypeDistributionOutput {
  financialDate: string;
  distribution: PlayTypeDistributionItem[];
}
