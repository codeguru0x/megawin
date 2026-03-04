/**
 * Lotto 5/35 – Operations Dashboard DTOs
 *
 * Tách riêng DTO cho các use case operations dashboard.
 * Mỗi endpoint trả về 1 phần nhỏ, lazy-load trên UI.
 */

import type { PlayType } from "@megawin/game-lotto535/entities";

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
// ─────────────────────────────────────────────

export interface GetNumberFrequencyInput {
  financialDate?: string;
  drawId?: string;
}

export interface NumberFrequencyItem {
  number: number;
  count: number;
}

export interface NumberFrequencyOutput {
  financialDate: string;
  mainNumbers: NumberFrequencyItem[];
  specialNumbers: NumberFrequencyItem[];
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
  boardCount: number;
  lineCount: number;
}

export interface PlayTypeDistributionOutput {
  financialDate: string;
  distribution: PlayTypeDistributionItem[];
}
