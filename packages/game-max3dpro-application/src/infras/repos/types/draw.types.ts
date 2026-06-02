/**
 * Draw infrastructure types — dùng chung cho DrawRepository.
 */

import type { DrawVietlottRef } from "@megawin/game-max3dpro/entities";

/**
 * Thông tin void: lý do, người thực hiện, thời điểm.
 * Dùng làm param của `drawRepo.voidDraw()`.
 */
export interface VoidInfo {
  reason: string;
  voidedBy?: string;
  voidedAt: Date;
}

/**
 * Shape cơ bản của DrawDoc — các fields chung, không gắn với game cụ thể.
 * DrawRepository dùng để cast khi cần đọc drawDate/drawId cho cursor pagination.
 */
export interface DrawDocBase {
  _id: unknown;
  drawId: string;
  drawDate: string;
  financialDate: string;
  drawTime: Date;
  status: string;
  sales: { openAt?: Date; closeAt: Date };
  financial?: DrawDocBaseFinancial;
  stats?: DrawDocBaseStats;
  voidInfo?: DrawDocBaseVoidInfo;
  voidSummary?: DrawDocBaseVoidSummary;
  vietlottRef?: DrawVietlottRef;
}

/**
 * Financial summary của 1 draw đã settle.
 * Dùng làm param của `updateSettleResult()` — ghi đè toàn bộ khi settle hoàn tất.
 */
export interface DrawDocBaseFinancial {
  /** Tổng doanh thu bán vé (VND). */
  totalRevenue: number;
  /** Tổng tiền thưởng cố định (VND). */
  totalFixedPrizes: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalAgentCommission: number;
  /** Profit công ty thu về (VND). = profit cho game không có Jackpot (Max3D, Max3D Pro). */
  companyTake: number;
}

/**
 * Stats tổng hợp của 1 draw đã settle.
 * Dùng làm param của `updateSettleResult()`.
 */
export interface DrawDocBaseStats {
  /** Tổng số entries đã settle. */
  ticketEntryCount: number;
  /** Tổng số lines của tất cả entries. */
  totalLineCount: number;
  /** Tổng tiền cược (VND). */
  totalSalesAmount: number;
  /** Tổng tiền trả thưởng (VND). */
  totalPayoutAmount: number;
}

/**
 * Thông tin void được ghi vào draw document.
 */
export interface DrawDocBaseVoidInfo {
  reason: string;
  voidedBy?: string;
  voidedAt: Date;
}

/**
 * Tổng kết void của 1 draw — ghi khi void pipeline hoàn tất.
 */
export interface DrawDocBaseVoidSummary {
  /** Tổng entries bị void. */
  totalVoidedEntries: number;
  /** Tổng tiền cược gốc (VND). */
  totalOriginalAmount: number;
  /** Tổng tiền hoàn trả (VND). */
  totalRefundAmount: number;
  /** Tổng tiền đã dispatch refund (VND). */
  totalRefundDispatched?: number;
  /** Thời điểm void hoàn tất. */
  completedAt?: Date;
}

/**
 * Chi tiết giải thưởng 1 hạng trong kỳ quay — denormalized cho API player.
 *
 * Ghi vào DrawDoc.settleSummary bởi CalculateFinancials khi settle hoàn tất.
 * Dùng bởi GetDrawResultPlayerUseCase để trả bảng giải thưởng — 1 DB call.
 */
export interface DrawSettleSummaryTier {
  /** Hạng giải (giá trị từ PrizeTier của game). */
  tier: string;
  /** Số lượt trúng hạng này (tổng hit count từ tất cả entries). */
  winnerCount: number;
  /**
   * Tổng tiền thưởng hạng này (VND).
   * = Σ(entry.payout.tiers[tier].amount) aggregate từ entries.
   */
  prizeAmount: number;
}

/**
 * Tổng kết bảng giải thưởng kỳ quay — denormalized cho API player.
 *
 * Ghi vào DrawDoc.settleSummary bởi CalculateFinancials (step 4 settle pipeline).
 * Tất cả tiers có winnerCount > 0 được ghi; tiers không có winner được bỏ qua
 * hoặc ghi với winnerCount = 0 tùy game.
 */
export interface DrawSettleSummary {
  /**
   * Bảng giải thưởng theo từng hạng.
   * Tất cả tiers luôn có mặt (kể cả winnerCount = 0).
   */
  tiers: DrawSettleSummaryTier[];
}
