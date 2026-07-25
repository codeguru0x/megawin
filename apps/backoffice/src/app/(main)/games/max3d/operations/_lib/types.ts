/**
 * Shared UI types cho trang Vận hành Max 3D.
 *
 * Các types này định nghĩa shape dữ liệu sau khi adapter
 * chuyển đổi từ API response → UI components. Tách khỏi
 * entity layer để components không phụ thuộc trực tiếp vào
 * DB schema.
 *
 * Max 3D khác Lotto535:
 * - Không có Jackpot → DrawFinancialDisplay không có jackpotContribution/Before/After
 * - 2 play modes: basic + plus
 * - Kết quả: 20 bộ ba số (special x2, first x4, second x6, third x8)
 */

import type { BasicPrizeTier, PlayMode, PlayType, PlusPrizeTier } from "@megawin/game-max3d/entities";

// ─── KPI ─────────────────────────────────────────────────────────────────────

export interface OpsKpi {
  /** Tổng doanh thu (VND). */
  totalRevenue: number;
  totalEntries: number;
  /** Tổng đơn vị cược = Σ(betUnitCount). Phản ánh tiền thực trả. */
  totalBetUnits: number;
  uniquePlayers: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
}

// ─── Tenant Breakdown ────────────────────────────────────────────────────────

export interface TenantRow {
  tenantId: string;
  tenantName: string;
  entries: number;
  /** Tổng đơn vị cược = Σ(betUnitCount). Dùng hiển thị thay cho lines khi betCount > 1. */
  betUnits: number;
  /** Doanh thu (VND). */
  revenue: number;
  /** Hoa hồng (VND). */
  commission: number;
  /** Phần trăm doanh thu so với tổng. */
  pct: number;
}

// ─── Play Type Distribution ──────────────────────────────────────────────────

export interface PlayTypeRow {
  playMode: PlayMode;
  playType: PlayType;
  label: string;
  entries: number;
  lines: number;
  /** Doanh thu (VND). */
  revenue: number;
  /** Phần trăm lines so với tổng. */
  pct: number;
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
  /** Thời điểm kết sổ thật (ISO 8601) — undefined nếu chưa từng settle. Hiển thị ở bước "Kết sổ". */
  settledAt?: string;
  tiers: {
    /** Play mode của tier — phân biệt basic `special` vs plus `special`. */
    mode: "basic" | "plus";
    tier: BasicPrizeTier | PlusPrizeTier;
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
  /** Tổng giải thưởng cố định (VND). Max 3D không có Jackpot. */
  totalFixedPrizes: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalAgentCommission: number;
  /** Phần công ty giữ lại (VND). */
  companyTake: number;
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
  playMode: PlayMode;
  playType: PlayType;
  playTypeLabel: string;
  /** Các bộ ba số đặt cược. */
  triplets: string[];
  /** Số lines cược. */
  lineCount: number;
  /** Số lần cược nhân bội (≥ 1). Hiển thị badge ×N khi > 1. */
  betCount: number;
  /** Tiền cược (VND). */
  amount: number;
  username: string;
  tenant: string;
}
