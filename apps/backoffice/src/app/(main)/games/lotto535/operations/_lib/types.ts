/**
 * Shared UI types cho trang Vận hành Lotto 5/35.
 *
 * Các types này định nghĩa shape dữ liệu sau khi adapter
 * chuyển đổi từ API response → UI components. Tách khỏi
 * entity layer để components không phụ thuộc trực tiếp vào
 * DB schema.
 */

import { PrizeTier, PlayType } from "@megawin/game-lotto535/entities";

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
  prevRevenue: number;
  prevEntries: number;
  prevLines: number;
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
  number: string;
  count: number;
  /** Số lượng lines chứa số này. */
  lines: number;
  /** Tổng tiền cược của các lines chứa số này (VND). */
  amount: number;
}

// ─── Settled Draw Result ─────────────────────────────────────────────────────

export interface DrawResult {
  /** 5 số chính (01-35). */
  winningMain: string[];
  winningSpecial: string;
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
  /** Công ty thu lý thuyết (VND) = round(revenue × companyRate). Mức trần trước cap. */
  companyTake: number;
  /**
   * Công ty THỰC THU (VND) sau cap bởi số dư.
   * = min(companyTake, max(revenue − commission − fixedPrizes, 0)). Dùng để tính Thu thuần.
   */
  actualCompanyTake: number;
  /** Phần đóng góp Jackpot (VND). */
  jackpotContribution: number;
  /** Jackpot pool đầu kỳ (VND). */
  jackpotBefore: number;
  /**
   * Jackpot pool cuối kỳ (VND) = jackpotBefore + jackpotContribution.
   * Có winner: pool đã trao cho winner. Split: quỹ trước khi chia tier1-5. Roll-over: mang sang kỳ sau.
   */
  jackpotAfter: number;
  /** Kỳ này có người trúng độc đắc hay không. */
  hasJackpotWinner: boolean;
  /** Kỳ này là kỳ chia giải (split cycle) — JP chia cho tier1-5 thay vì trao độc đắc. */
  isSplitCycle: boolean;
  /**
   * Tổng pool Jackpot đã xử lý kỳ này (VND) = jackpotBefore + jackpotContribution.
   * Có winner: trao cho winner. Split: chia cho tier1-5. 0 nếu roll-over.
   */
  jackpotPrizeAwarded: number;
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
  /** Các số chính của board đầu tiên. */
  mainNumbers: string[];
  /** Các số đặc biệt (SpecialCover có nhiều, Standard có 1, MainCover không có). */
  specialNumbers: string[];
  /** Suffix mô tả kiểu bao, VD: "(bao 4/5)". */
  suffix?: string;
  /** Tiền cược (VND). */
  amount: number;
  username: string;
  tenant: string;
}
