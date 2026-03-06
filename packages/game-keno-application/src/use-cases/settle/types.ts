/**
 * Keno Settle – Shared Types
 *
 * Các interface dùng chung giữa settle steps.
 * Output step trước = Input step sau → định nghĩa 1 lần, dùng chung.
 *
 * DATA FLOW:
 *   PrepareSettle → SettleEntries → ApplyPayoutCaps → SyncTicketSummaries
 *                                                   → CalculateFinancials → ...
 *
 *   $settleCtx (= PrepareSettleResult) được truyền xuyên suốt qua step function.
 *   Mỗi step destructure fields cần thiết từ $settleCtx.
 */

import type { BigSmallPrizes, EvenOddPrizes, PayoutCaps } from "@megawin/game-keno/entities";

/**
 * Kết quả quay Keno — output PrepareSettle, input SettleEntries.
 * Mapping 1:1 với DrawResultForMatch của helpers layer.
 */
export interface KenoDrawResult {
  /** 20 số trúng (string[], ví dụ ["03", "12", "25", ...]). */
  winningNumbers: string[];
  /** Số lượng số "lớn" (41-80) trong 20 số quay. */
  bigCount: number;
  /** Số lượng số "nhỏ" (1-40) trong 20 số quay. */
  smallCount: number;
  /** Số lượng số chẵn trong 20 số quay. */
  evenCount: number;
  /** Số lượng số lẻ trong 20 số quay. */
  oddCount: number;
}

/**
 * Config settle — output PrepareSettle, dùng bởi nhiều steps.
 *
 * Chứa tất cả config cần thiết cho settle flow:
 *   - companyRate         → CalculateFinancials (tính phần công ty)
 *   - basicPrizes         → SettleEntries (tra bảng giải) + ApplyPayoutCaps (lấy fixedPrize)
 *   - bigSmallPrizes      → SettleEntries (match side bet Lớn/Nhỏ)
 *   - evenOddPrizes       → SettleEntries (match side bet Chẵn/Lẻ)
 *   - payoutCaps          → ApplyPayoutCaps (giới hạn trả thưởng bậc 8/9/10)
 */
export interface KenoSettleConfig {
  /** Tỷ lệ phần công ty (0–1). Ví dụ: 0.15 = 15%. */
  companyRate: number;
  /** Bảng giải thưởng cách chơi cơ bản. Key: "pick{N}", Value: { matchCount: prize }. */
  basicPrizes: Record<string, Record<number, number>>;
  /** Bảng giải thưởng side bet Lớn/Nhỏ (VND). */
  bigSmallPrizes: BigSmallPrizes;
  /** Bảng giải thưởng side bet Chẵn/Lẻ (VND). */
  evenOddPrizes: EvenOddPrizes;
  /**
   * Giới hạn trả thưởng mỗi kỳ cho bậc 8/9/10 theo quy tắc Vietlott.
   * Khi tổng số bộ trúng top prize > maxSetsForFixed → chia đều maxPerDraw.
   */
  payoutCaps: PayoutCaps;
}

/**
 * Financials output — output CalculateFinancials, input BuildReport + FinalizeSettle.
 * Kết quả tính tài chính tổng hợp cho 1 kỳ quay.
 */
export interface KenoSettleFinancials {
  /** Tổng doanh thu = Σ(entry.amount) không void (VND). */
  totalRevenue: number;
  /** Tổng tiền thưởng = Σ(entry.payout.winAmount) entries thắng (VND). */
  totalPrizes: number;
  /** Tổng hoa hồng đại lý = Σ(tenant commission) (VND). */
  totalAgentCommission: number;
  /** Phần công ty = Math.round(totalRevenue × companyRate) (VND). */
  companyTake: number;
  /** Chi tiết tài chính từng đại lý. */
  tenantBreakdown: Array<{
    /** ID đại lý. */
    tenantId: string;
    /** Doanh thu đại lý (VND). */
    revenue: number;
    /** Hoa hồng đại lý (VND). */
    commission: number;
    /** Tỷ lệ hoa hồng (0–1). */
    commissionRate: number;
    /** Số entries của đại lý. */
    entryCount: number;
  }>;
}
