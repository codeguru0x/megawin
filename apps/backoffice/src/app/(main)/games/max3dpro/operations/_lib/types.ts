/**
 * Shared UI types cho trang Vận hành Max 3D Pro.
 *
 * Các types này định nghĩa shape dữ liệu sau khi adapter
 * chuyển đổi từ API response → UI components. Tách khỏi
 * entity layer để components không phụ thuộc trực tiếp vào
 * DB schema.
 *
 * Max 3D Pro khác Max 3D:
 * - Không có Jackpot → DrawFinancialDisplay không có jackpotContribution
 * - 2 play modes: multiNumber + multiDigit (không có basic/plus)
 * - Core unit là TripletPair (ordered pair)
 * - 8 PrizeTier bao gồm specialSub (Giải phụ Đặc Biệt)
 * - Duplicate x2: nếu 2 triplet trong pair giống nhau, giải nhân đôi
 * - Kết quả: 20 bộ ba số (special x2, first x4, second x6, third x8)
 */

import type { PlayMode } from "@megawin/game-max3dpro/entities";

// ─── KPI ─────────────────────────────────────────────────────────────────────

export interface OpsKpi {
  /** Tổng doanh thu (VND). */
  totalRevenue: number;
  totalEntries: number;
  /** Tổng lines = tổng TripletPair (đơn vị cược). */
  totalLines: number;
  uniquePlayers: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
}

// ─── Tenant Breakdown ────────────────────────────────────────────────────────

export interface TenantRow {
  tenantId: string;
  tenantName: string;
  entries: number;
  lines: number;
  /** Doanh thu (VND). */
  revenue: number;
  /** Hoa hồng (VND). */
  commission: number;
  /** Phần trăm doanh thu so với tổng. */
  pct: number;
}

// ─── Play Type Distribution ──────────────────────────────────────────────────

export interface PlayTypeRow {
  /** Max 3D Pro chỉ có multiNumber | multiDigit. */
  playMode: PlayMode;
  label: string;
  entries: number;
  lines: number;
  /** Doanh thu (VND). */
  revenue: number;
  /** Phần trăm lines so với tổng. */
  pct: number;
  /** Trung bình số cặp TripletPair mỗi entry. */
  avgPairsPerEntry: number;
}

// ─── Triplet Frequency ───────────────────────────────────────────────────────

export interface TripletFreq {
  /** Bộ ba số (000-999). */
  triplet: string;
  /** Số lần xuất hiện (số boards chứa triplet này). */
  count: number;
  /** Tổng tiền cược của các boards chứa triplet này (VND). */
  revenue: number;
}

// ─── Settled Draw Result ─────────────────────────────────────────────────────

export interface DrawResult {
  /** 2 bộ ba ĐB quay số. */
  special: [string, string];
  /** 4 bộ ba Giải Nhất. */
  first: [string, string, string, string];
  /** 6 bộ ba Giải Nhì. */
  second: [string, string, string, string, string, string];
  /** 8 bộ ba Giải Ba. */
  third: [string, string, string, string, string, string, string, string];
  settledAt: string;
  tiers: {
    tier: string;
    label: string;
    /** Số lines trúng thưởng. */
    winnerCount: number;
    /** Tiền thưởng đơn vị / line (VND). */
    prizeAmount: number;
    /** Tổng giải thưởng tier này (VND). */
    totalPrize: number;
  }[];
  financial: DrawFinancialDisplay;
}

export interface DrawFinancialDisplay {
  /** Tổng doanh thu (VND). */
  totalRevenue: number;
  /** Tổng giải thưởng cố định (VND). Max 3D Pro không có Jackpot. */
  totalFixedPrizes: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalAgentCommission: number;
  /** Lợi nhuận = revenue - prizes - commission (VND). Có thể âm. */
  profit: number;
}

// ─── Void Info ───────────────────────────────────────────────────────────────

export interface VoidInfo {
  reason: string;
  voidedBy: string;
  voidedAt: string;
  /** Tổng tiền hoàn trả (VND). */
  refundAmount: number;
  entryCount: number;
}

// ─── Live Feed (Recent Entries) ─────────────────────────────────────────────

export interface LiveFeedEntry {
  entryId: string;
  time: string;
  /** multiNumber | multiDigit */
  playMode: PlayMode;
  playModeLabel: string;
  /** Các bộ ba số đặt cược. */
  triplets: string[];
  /** Số cặp TripletPair cược. */
  lineCount: number;
  /** Số lần cược nhân bội (≥ 1). Hiển thị badge ×N khi > 1. */
  betCount: number;
  /** Tiền cược (VND). */
  amount: number;
  username: string;
  tenant: string;
}
