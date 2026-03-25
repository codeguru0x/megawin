/**
 * Mega 6/45 – Operations Dashboard DTOs
 *
 * Mỗi endpoint trả về 1 phần nhỏ, lazy-load trên UI.
 * Mega 6/45 khác Lotto 5/35: không có specialNumbers, chỉ có numbers (01-45).
 */

import type { PlayType } from "@megawin/game-mega645/entities";

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
// Mega 6/45: chỉ có numbers (01-45), không có specialNumbers.
// ─────────────────────────────────────────────

export interface GetNumberFrequencyInput {
  financialDate?: string;
  drawId?: string;
}

export interface NumberFrequencyItem {
  /** Số (01-45, dạng string zero-padded). */
  number: string;
  /** Số boards chứa số này (= số lần được chọn). */
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
  /** Tần suất 45 số chính (01-45). */
  numbers: NumberFrequencyItem[];
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
  /** Số boards (tức số selections của kiểu chơi đó). */
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
