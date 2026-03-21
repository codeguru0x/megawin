/**
 * Max 3D Pro – Operations Dashboard DTOs
 *
 * Tách riêng DTO cho các use case operations dashboard.
 * Mỗi endpoint trả về 1 phần nhỏ, lazy-load trên UI.
 *
 * Max 3D Pro KHÔNG CÓ Jackpot, KHÔNG CÓ companyRate.
 * Financial model: companyTake = revenue - fixedPrizes - agentCommission.
 * Đơn vị cơ bản: TripletPair (ordered pair {first, second}).
 */

import type { PlayMode } from "@megawin/game-max3dpro/entities";

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
   * Tổng đơn vị cược = Σ(entry.betUnitCount) = Σ(board.lineCount × board.betCount).
   * Dùng để đối chiếu revenue: totalRevenue = totalBetUnits × unitPrice.
   * Fallback sang lineCount cho entries cũ (betCount = 1).
   */
  totalBetUnits: number;
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
  /**
   * Tổng đơn vị cược = Σ(board.lineCount × board.betCount) cho tenant này.
   * Fallback sang lineCount cho entries cũ.
   */
  betUnits: number;
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
  /**
   * Cách chơi: multiNumber / multiDigit.
   * multiNumber: chọn 3-20 bộ ba → P(n,2) cặp.
   * multiDigit: 3 chữ số đầu × 3 chữ số sau → perms(front) × perms(back) cặp.
   */
  playMode: PlayMode;
  /** Số boards thuộc playMode này. */
  boardCount: number;
  /** Tổng TripletPair lines của các boards đó (không tính betCount). */
  lineCount: number;
  /**
   * Tổng đơn vị cược = Σ(board.lineCount × board.betCount) cho playMode này.
   * Phản ánh tiền thực của từng playMode.
   */
  betUnitCount: number;
  /** Số entries distinct chứa ít nhất 1 board playMode này. */
  entryCount: number;
  /** Tổng doanh thu xấp xỉ (VND). */
  revenue: number;
  /**
   * Trung bình số cặp TripletPair per entry.
   * Giúp đánh giá độ phức tạp trung bình mỗi đơn cược.
   */
  avgPairsPerEntry: number;
}

export interface PlayTypeDistributionOutput {
  financialDate: string;
  distribution: PlayTypeDistributionItem[];
}
