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
  /** 5 số chính trúng thưởng — string zero-padded, giữ nguyên thứ tự quay. */
  winningMain: string[];
  /** Số đặc biệt trúng thưởng — string zero-padded "01"-"12". */
  winningSpecial: string;
}

/**
 * Config settle — output PrepareSettle, input CalculateFinancials.
 * Chứa tất cả config cần thiết cho settle flow.
 */
export interface LottoSettleConfig {
  /** Số tiền khởi điểm Jackpot (VND). */
  seedAmount: number;
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
  /** Có người trúng Jackpot trong kỳ hay không. */
  hasJackpotWinner: boolean;
  /** Chi tiết phân bổ split — chỉ có khi isSplitCycle = true VÀ có winner tier1-tier5. */
  splitDetails?: LottoSplitDetails;
}
