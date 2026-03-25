/**
 * Shared UI types cho trang Vận hành Mega 6/45.
 *
 * Các types này định nghĩa shape dữ liệu sau khi adapter
 * chuyển đổi từ API response → UI components. Tách khỏi
 * entity layer để components không phụ thuộc trực tiếp vào
 * DB schema.
 *
 * Mega 6/45 khác Lotto 5/35:
 * - Không có specialNumbers
 * - 4 hạng giải (jackpot, tier1, tier2, tier3)
 * - 1 kỳ/ngày (drawNo luôn = 1)
 */

import { PrizeTier, PlayType } from "@megawin/game-mega645/entities";

// ─── KPI ─────────────────────────────────────────────────────────────────────

export interface OpsKpi {
  /** Tổng doanh thu (VND). */
  totalRevenue: number;
  totalEntries: number;
  totalLines: number;
  uniquePlayers: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
  /** Doanh thu ròng sau hoa hồng (VND). */
  netRevenue: number;
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
  playType: PlayType;
  label: string;
  entries: number;
  lines: number;
  /** Doanh thu (VND). */
  revenue: number;
  /** Phần trăm lines so với tổng. */
  pct: number;
}

// ─── Number Frequency ────────────────────────────────────────────────────────

export interface NumberFreq {
  /** Số chính, zero-padded string "01"-"45". */
  number: string;
  count: number;
  /** Số lượng lines chứa số này. */
  lines: number;
  /** Tổng tiền cược của các lines chứa số này (VND). */
  amount: number;
}

// ─── Settled Draw Result ─────────────────────────────────────────────────────

export interface DrawResult {
  /** 6 số chính (01-45). */
  winningNumbers: [string, string, string, string, string, string];
  settledAt: string;
  tiers: {
    tier: PrizeTier;
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
  /** Tổng giải thưởng cố định (VND). */
  totalFixedPrizes: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalAgentCommission: number;
  /** Phần công ty giữ lại (VND). */
  companyTake: number;
  /** Phần đóng góp Jackpot (VND). */
  jackpotContribution: number;
  /** Jackpot pool đầu kỳ (VND). */
  jackpotBefore: number;
  /** Jackpot pool cuối kỳ (VND). */
  jackpotAfter: number;
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
  playType: string;
  playTypeLabel: string;
  /** Các số chính của board đầu tiên (01-45). */
  numbers: string[];
  /** Suffix mô tả kiểu bao, VD: "(bao 5)", "(bao 7)". */
  suffix?: string;
  /** Tiền cược (VND). */
  amount: number;
  username: string;
  tenant: string;
}
