/**
 * Shared UI types cho trang Vận hành Power 6/55.
 *
 * Power 6/55 khác Mega 6/45:
 * - Có bonusNumber trong kết quả quay
 * - 6 hạng giải (jackpot1, jackpot2, tier1-4)
 * - Jackpot kép: JP1 (6/6) + JP2 (5/6 + bonus)
 * - 55 số (01-55)
 */

import { PrizeTier, PlayType } from "@megawin/game-power655/entities";

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
  /** Số chính, zero-padded string "01"-"55". */
  number: string;
  count: number;
  lines: number;
  amount: number;
}

// ─── Settled Draw Result ─────────────────────────────────────────────────────

export interface DrawResult {
  /** 6 số chính (01-55). */
  winningMain: string[];
  /** Số thưởng (bonus number). */
  bonusNumber: string;
  settledAt: string;
  tiers: {
    tier: PrizeTier;
    label: string;
    winnerCount: number;
    /** Tiền thưởng đơn vị / line (VND). JP = chia theo pool. */
    prizeAmount: number;
    totalPrize: number;
  }[];
  financial: DrawFinancialDisplay;
}

export interface DrawFinancialDisplay {
  totalRevenue: number;
  totalFixedPrizes: number;
  totalAgentCommission: number;
  /** Công ty thu lý thuyết (VND) = round(revenue × companyRate). Mức trần trước cap. */
  companyTake: number;
  /**
   * Công ty THỰC THU (VND) sau cap bởi số dư.
   * = min(companyTake, max(revenue − commission − fixedPrizes, 0)). Dùng để tính Thu thuần.
   */
  actualCompanyTake: number;
  /** Đóng góp vào JP1 (VND). Đã trừ jp1Overflow nếu overflow kích hoạt. */
  jackpot1Contribution: number;
  /** Đóng góp vào JP2 (VND). Đã cộng jp1Overflow nếu overflow kích hoạt + có JP2 winner. */
  jackpot2Contribution: number;
  /**
   * Phần JP1 vượt ngưỡng chuyển sang JP2 (VND).
   * > 0 chỉ khi: JP1 > threshold + không có JP1 winner + có JP2 winner.
   */
  jp1Overflow: number;
  jackpot1Before: number;
  jackpot1After: number;
  jackpot2Before: number;
  jackpot2After: number;
  /** Kỳ này có người trúng JP1 (6/6) hay không. */
  hasJackpot1Winner: boolean;
  /** Kỳ này có người trúng JP2 (5/6 + bonus) hay không. */
  hasJackpot2Winner: boolean;
  /** Tổng pool JP1 đã trao cho winner (VND) = opening + contribution. 0 nếu không có winner. */
  jackpot1PrizeAwarded: number;
  /** Tổng pool JP2 đã trao cho winner (VND) = opening + contribution. 0 nếu không có winner. */
  jackpot2PrizeAwarded: number;
}

// ─── Void Info ───────────────────────────────────────────────────────────────

export interface VoidInfo {
  reason: string;
  voidedBy: string;
  voidedAt: string;
  refundAmount: number;
  entryCount: number;
}

// ─── Live Feed (Recent Entries) ─────────────────────────────────────────────

export interface LiveFeedEntry {
  entryId: string;
  time: string;
  playType: string;
  playTypeLabel: string;
  /** Các số chính của board đầu tiên (01-55). */
  mainNumbers: string[];
  /** Suffix mô tả kiểu bao, VD: "(bao 7)", "(bao 15)". */
  suffix?: string;
  amount: number;
  username: string;
  tenant: string;
}
