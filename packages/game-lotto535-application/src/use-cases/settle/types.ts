/**
 * Lotto 5/35 Settle – Shared Types
 *
 * Các interface dùng chung giữa settle steps.
 * Output step trước = Input step sau → định nghĩa 1 lần, dùng chung.
 */

/**
 * Kết quả quay Lotto 5/35 — output PrepareSettle, input SettleEntries.
 */
export interface LottoDrawResult {
  /** 5 số chính trúng thưởng. */
  winningMain: number[];
  /** Số đặc biệt trúng thưởng (1-12). */
  winningSpecial: number;
}

/**
 * Config settle — output PrepareSettle, input CalculateFinancials.
 * Chứa tất cả config cần thiết cho settle flow.
 */
export interface LottoSettleConfig {
  /** Số tiền khởi điểm Jackpot (VND). */
  seedAmount: number;
  /** Ngưỡng kích hoạt chia Jackpot (VND). */
  splitThreshold: number;
  /** Tỷ lệ chia Jackpot theo tier. */
  splitRatios: {
    tier1: number;
    tier2: number;
    tier3: number;
    tier4: number;
    tier5: number;
  };
  /** Tỷ lệ công ty thu về trên doanh thu (0-1). */
  companyRate: number;
  /** Tỷ lệ hoa hồng đại lý mặc định (0-1). */
  defaultCommissionRate: number;
}

/**
 * Chi tiết phân bổ split cho 1 tier — dùng chung cho CalculateFinancials,
 * ApplySplitBonuses, FinalizeSettle.
 */
export interface LottoSplitTierDetail {
  /** Số tiền ban đầu phân cho tier (VND) = jackpotAmount × splitRatio[tier]. */
  initialAmount: number;
  /** Số tiền tái phân bổ từ tier không có winner (VND). */
  redistributedAmount: number;
  /** Tổng tiền tier nhận (VND) = initialAmount + redistributedAmount. */
  totalAmount: number;
  /** Số người trúng tier này. */
  winnerCount: number;
  /** Tiền thưởng mỗi người (VND) = totalAmount / winnerCount. */
  bonusPerWinner: number;
}

/**
 * Chi tiết phân bổ split — key = tier name, value = thông tin phân bổ.
 * Chỉ có khi isSplitCycle = true.
 */
export type LottoSplitDetails = Record<string, LottoSplitTierDetail>;

/**
 * Financials output — output CalculateFinancials, input BuildReport + FinalizeSettle.
 * Không bao gồm drawId (mỗi step tự biết drawId từ context).
 */
export interface LottoSettleFinancials {
  /** Tổng doanh thu kỳ (VND). */
  totalRevenue: number;
  /** Tổng giải thưởng cố định đã trả (VND) — không bao gồm Jackpot. */
  totalFixedPrizes: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalAgentCommission: number;
  /** Phần công ty thu về tối đa (VND). */
  companyTake: number;
  /** Phần công ty thực tế thu về (VND). */
  actualCompanyTake: number;
  /** Phần đóng góp vào quỹ Jackpot (VND). */
  jackpotContribution: number;
  /** Số tiền Jackpot cuối kỳ (VND). */
  closingJackpot: number;
  /** Số tiền Jackpot mở cho kỳ tiếp theo (VND). */
  nextJackpotOpening: number;
  /** Có người trúng Jackpot trong kỳ hay không. */
  hasJackpotWinner: boolean;
  /** Chi tiết phân bổ split — chỉ có khi isSplitCycle = true. */
  splitDetails?: LottoSplitDetails;
  /** Phân tích doanh thu theo từng tenant. */
  tenantBreakdown: Array<{
    tenantId: string;
    revenue: number;
    commission: number;
    commissionRate: number;
    entryCount: number;
  }>;
}
