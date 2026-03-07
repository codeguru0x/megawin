/**
 * Mega 6/45 – Jackpot Cycle Document
 *
 * Collection: mega645_jackpot_cycles
 */

import type { ISODateString, SplitRatios } from "./types";

export const JackpotCycleStatus = {
  Active: "active",
  Closed: "closed",
} as const;

export type JackpotCycleStatus = (typeof JackpotCycleStatus)[keyof typeof JackpotCycleStatus];

export const JackpotCycleCloseReason = {
  Split: "split",
  Winner: "winner",
  ManualReset: "manual_reset",
} as const;

export type JackpotCycleCloseReason =
  (typeof JackpotCycleCloseReason)[keyof typeof JackpotCycleCloseReason];

/** Thông tin người trúng Jackpot trong cycle. */
export interface JackpotWinnerInfo {
  /** ID tài khoản người trúng. */
  accountId: string;
  /** Tên đăng nhập người trúng. */
  username?: string;
  /** ID đại lý (tenant) bán vé trúng. */
  tenantId: string;
  /** Tên đại lý. */
  tenantName?: string;
  /** Số tiền Jackpot trúng (VND). */
  prizeAmount: number;
  /** ID entry trúng Jackpot. */
  entryId: string;
  /** ID kỳ quay trúng Jackpot. */
  drawId: string;
}

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/** Cấu hình split áp dụng cho chu kỳ (snapshot từ global config khi tạo cycle). */
export interface JackpotCycleConfig {
  /** Ngưỡng kích hoạt chia Jackpot (VND). */
  splitThreshold: number;
  /** Tỷ lệ chia cho từng tier. */
  splitRatios: SplitRatios;
}

/** Phân bổ tiền thưởng cho 1 tier trong kỳ chia. */
export interface SplitTierAllocation {
  /** Số người trúng tier này trong kỳ quay split. */
  winnerCount: number;
  /** Tiền thưởng bonus cho mỗi người trúng (VND). */
  bonusPerWinner: number;
  /** Tổng tiền đã trả cho tier (VND). Công thức: bonusPerWinner × winnerCount. */
  totalAmount: number;
}

/** Chi tiết chia Jackpot (chỉ có khi closeReason = "split"). */
export interface JackpotSplitDetail {
  /** Tổng số tiền Jackpot được chia (VND). */
  splitAmount: number;
  /**
   * Phân bổ cho từng tier.
   * Key = PrizeTier ("tier1" | "tier2" | "tier3").
   */
  tierAllocations: Record<string, SplitTierAllocation>;
  /** Tổng số người nhận bonus từ split. */
  totalWinners: number;
  /** Tổng tiền bonus đã trả (VND). */
  totalPaid: number;
}

/**
 * Document theo dõi chu kỳ tích luỹ Jackpot.
 * Mỗi cycle bắt đầu từ seedAmount và kết thúc khi có người trúng hoặc split.
 */
export interface JackpotCycleDoc {
  /** MongoDB document ID. */
  _id: unknown;

  /** Số thứ tự chu kỳ (tăng dần, bắt đầu từ 1). */
  cycleNo: number;
  /** Trạng thái chu kỳ (active / closed). */
  status: JackpotCycleStatus;

  /** ID kỳ quay bắt đầu chu kỳ. */
  startDrawId: string;
  /** Thời điểm bắt đầu chu kỳ. */
  startedAt: Date;
  /** Số tiền khởi điểm chu kỳ (VND). Mặc định: 12 tỷ. */
  seedAmount: number;

  /**
   * Giá trị Jackpot hiện tại (VND).
   * Công thức: seedAmount + totalContribution - (tiền Jackpot đã trả nếu có).
   */
  currentAmount: number;
  /** Giá trị Jackpot cao nhất đạt được trong chu kỳ (VND). */
  peakAmount: number;
  /**
   * Tổng đóng góp vào quỹ Jackpot từ đầu chu kỳ (VND).
   * Công thức: Σ(draw.financial.jackpotContribution) cho tất cả kỳ quay trong cycle.
   */
  totalContribution: number;
  /** Số kỳ quay đã settle trong chu kỳ. */
  drawCount: number;
  /** ID kỳ quay cuối cùng đã settle trong chu kỳ. */
  lastSettledDrawId?: string;

  /** Cấu hình split áp dụng cho chu kỳ (snapshot từ global config khi tạo cycle). */
  config: JackpotCycleConfig;

  /** ID kỳ quay kết thúc chu kỳ. */
  endDrawId?: string;
  /** Thời điểm đóng chu kỳ. */
  closedAt?: Date;
  /** Lý do đóng chu kỳ (split / winner / manual_reset). */
  closeReason?: JackpotCycleCloseReason;

  /** Chi tiết chia Jackpot (chỉ có khi closeReason = "split"). */
  splitDetail?: JackpotSplitDetail;

  /** Danh sách người trúng Jackpot (6/6 số) trong chu kỳ. */
  winners?: JackpotWinnerInfo[];

  /** Thời điểm tạo document. */
  createdAt: Date;
  /** Thời điểm cập nhật cuối cùng. */
  updatedAt: Date;
}
