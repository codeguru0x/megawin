/**
 * Mega 6/45 Settle – Shared Types
 *
 * Các interface dùng chung giữa settle steps.
 * Output step trước = Input step sau → định nghĩa 1 lần, dùng chung.
 */

/**
 * Kết quả quay Mega 6/45 — output PrepareSettle, input SettleEntries.
 * Mapping 1:1 với DrawResultForMatch của helpers layer.
 */
export interface MegaDrawResult {
  /** 6 số chính trúng thưởng (1-45). */
  winningMain: number[];
}

/**
 * Config settle — output PrepareSettle, input CalculateFinancials.
 * Chứa tất cả config cần thiết cho settle flow.
 */
export interface MegaSettleConfig {
  /** Giá trị khởi tạo jackpot khi tạo cycle mới (VND). */
  seedAmount: number;
  /** Ngưỡng chia jackpot (VND). */
  splitThreshold: number;
  /** Tỷ lệ chia jackpot cho từng hạng khi split. */
  splitRatios: {
    /** Tỷ lệ chia cho tier1 / jackpot (0-1). */
    tier1: number;
    /** Tỷ lệ chia cho tier2 – 5/6 (0-1). */
    tier2: number;
    /** Tỷ lệ chia cho tier3 – 4/6 (0-1). */
    tier3: number;
  };
  /** Tỷ lệ phần trăm công ty hưởng từ doanh thu (0-1). */
  companyRate: number;
  /** Tỷ lệ hoa hồng mặc định cho đại lý (0-1). */
  defaultCommissionRate: number;
}

/**
 * Chi tiết chia jackpot cho 1 tier khi split.
 */
export interface MegaSplitTierDetail {
  /** Số tiền ban đầu phân bổ cho hạng = jackpotAmount × splitRatio (VND). */
  initialAmount: number;
  /** Số tiền tái phân phối từ hạng không có người trúng (VND). */
  redistributedAmount: number;
  /** Tổng tiền hạng = initialAmount + redistributedAmount (VND). */
  totalAmount: number;
  /** Số người trúng hạng này. */
  winnerCount: number;
  /** Tiền thưởng mỗi người = totalAmount / winnerCount (VND). */
  bonusPerWinner: number;
}

/**
 * Financials output — output CalculateFinancials, input BuildReport + FinalizeSettle.
 * EXCLUDING drawId (drawId nằm trong context).
 */
export interface MegaSettleFinancials {
  totalRevenue: number;
  totalFixedPrizes: number;
  totalAgentCommission: number;
  companyTake: number;
  actualCompanyTake: number;
  jackpotContribution: number;
  closingJackpot: number;
  nextJackpotOpening: number;
  hasJackpotWinner: boolean;
  splitDetails?: Record<string, MegaSplitTierDetail>;
  tenantBreakdown: Array<{
    tenantId: string;
    revenue: number;
    commission: number;
    commissionRate: number;
    entryCount: number;
  }>;
}
