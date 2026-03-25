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
  /**
   * Tổng đơn vị cược = Σ(betUnitCount).
   * Phân biệt với totalLines khi có betCount > 1.
   */
  totalBetUnits: number;
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
  /** Số (1–35 cho main, 1–12 cho special). */
  number: number;
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
