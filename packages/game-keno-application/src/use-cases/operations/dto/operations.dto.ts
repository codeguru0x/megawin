/**
 * Keno – Operations Dashboard DTOs
 *
 * Mỗi endpoint trả về 1 phần nhỏ, lazy-load trên UI.
 *
 * Keno khác biệt so với các game khác:
 *   - Không có Jackpot tích luỹ — financial chỉ có companyTake
 *   - Cách chơi cơ bản: pick1-pick10 (10 loại)
 *   - Side bets: bigSmall, evenOdd (2 loại)
 *   - 80 số (01-80), tần suất cao ~120 kỳ/ngày
 *   - Không có expandedLines (1 board = 1 selection = 1 line)
 */

import type { KenoPlayType } from "@megawin/game-keno/entities";

// ─────────────────────────────────────────────
// GetOpsSummary
// ─────────────────────────────────────────────

export interface GetOpsSummaryInput {
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
   * Tổng boards (basic pick1-10).
   * Keno 1 board = 1 line (không expand như Lotto 5/35).
   */
  totalBoards: number;
  /** Tổng side bets (bigSmall + evenOdd). */
  totalSideBets: number;
  /** Số người chơi unique (distinct accountId). */
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
  /** Mã đại lý. */
  tenantId: string;
  /** Số entries. */
  entries: number;
  /** Số boards (basic). */
  boards: number;
  /** Số người chơi unique. */
  players: number;
  /** Doanh thu (VND). */
  revenue: number;
  /** Hoa hồng (VND). */
  commission: number;
  /** Tổng payout (VND). */
  payout: number;
}

export interface TenantBreakdownOutput {
  financialDate: string;
  tenants: TenantBreakdownItem[];
}

// ─────────────────────────────────────────────
// GetNumberFrequency
// Keno: 80 số (01-80), không phân biệt special/main.
// ─────────────────────────────────────────────

export interface GetNumberFrequencyInput {
  financialDate?: string;
  drawId?: string;
}

export interface NumberFrequencyItem {
  /** Số (01-80, dạng string zero-padded). */
  number: string;
  /** Số boards chứa số này (= số lần được chọn). */
  count: number;
  /** Số entries distinct có board chứa số này. */
  entries: number;
  /** Xấp xỉ doanh thu từ boards chứa số này (VND). */
  revenue: number;
}

export interface NumberFrequencyOutput {
  financialDate: string;
  /** Tần suất 80 số (01-80), sorted theo number asc. */
  numbers: NumberFrequencyItem[];
}

// ─────────────────────────────────────────────
// GetPlayTypeDistribution
// Keno: 12 loại (pick1-10, bigSmall, evenOdd).
// ─────────────────────────────────────────────

export interface GetPlayTypeDistributionInput {
  financialDate?: string;
  drawId?: string;
}

export interface PlayTypeDistributionItem {
  /** Kiểu chơi (pick1-pick10, bigSmall, evenOdd). */
  playType: KenoPlayType;
  /**
   * Số selections của kiểu chơi này.
   * Basic: số boards; Side bet: số side bet entries.
   */
  selectionCount: number;
  /** Số entries có ít nhất 1 selection kiểu này. */
  entryCount: number;
  /** Xấp xỉ doanh thu (VND). */
  revenue: number;
}

export interface PlayTypeDistributionOutput {
  financialDate: string;
  distribution: PlayTypeDistributionItem[];
}
