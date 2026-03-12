/**
 * Power 6/55 – Operations Dashboard DTOs
 *
 * Mỗi endpoint trả về 1 phần nhỏ, lazy-load trên UI.
 * Power 6/55 khác Mega 6/45: có bonusNumber, jackpot kép (JP1 + JP2), 55 số.
 */

import type { PlayType } from "@megawin/game-power655/entities";

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
  /** Tổng lines. */
  totalLines: number;
  /** Số người chơi unique. */
  uniquePlayers: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
  /** Tổng payout (VND) — chỉ có với entries đã settle. */
  totalPayout: number;
}

// ─────────────────────────────────────────────
// GetTenantBreakdown
// ─────────────────────────────────────────────

export interface GetTenantBreakdownInput {
  financialDate?: string;
  drawId?: string;
}

export interface TenantBreakdownItem {
  tenantId: string;
  entries: number;
  lines: number;
  players: number;
  revenue: number;
  commission: number;
  payout: number;
}

export interface TenantBreakdownOutput {
  financialDate: string;
  tenants: TenantBreakdownItem[];
}

// ─────────────────────────────────────────────
// GetNumberFrequency
// Power 6/55: mainNumbers (01-55), không có specialNumbers (bonus không tính vào selection).
// ─────────────────────────────────────────────

export interface GetNumberFrequencyInput {
  financialDate?: string;
  drawId?: string;
}

export interface NumberFrequencyItem {
  /** Số (01-55, dạng string zero-padded). */
  number: string;
  /** Số boards chứa số này. */
  count: number;
  /** Tổng expandedLines của các boards chứa số này. */
  lines: number;
  /** Số entries distinct có board chứa số này. */
  entries: number;
  /** Xấp xỉ doanh thu từ boards chứa số này (VND). */
  revenue: number;
}

export interface NumberFrequencyOutput {
  financialDate: string;
  /** Tần suất 55 số chính (01-55). */
  mainNumbers: NumberFrequencyItem[];
}

// ─────────────────────────────────────────────
// GetPlayTypeDistribution
// ─────────────────────────────────────────────

export interface GetPlayTypeDistributionInput {
  financialDate?: string;
  drawId?: string;
}

export interface PlayTypeDistributionItem {
  playType: PlayType;
  /** Số boards (selections) của kiểu chơi đó. */
  boardCount: number;
  /** Tổng lines đã expand. */
  lineCount: number;
  /** Số entries chứa ít nhất 1 board kiểu này. */
  entryCount: number;
  /** Tổng doanh thu (VND) từ entries kiểu này. */
  revenue: number;
}

export interface PlayTypeDistributionOutput {
  financialDate: string;
  distribution: PlayTypeDistributionItem[];
}
