/**
 * Mega 6/45 – Jackpot Cycle Document
 *
 * Collection: mega645_jackpot_cycles
 */

import type { ISODateString } from "./types";

export const JackpotCycleStatus = {
  Active: "active",
  Closed: "closed",
} as const;

export type JackpotCycleStatus = (typeof JackpotCycleStatus)[keyof typeof JackpotCycleStatus];

export const JackpotCycleCloseReason = {
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
  username: string;
  /** ID đại lý (tenant) bán vé trúng. */
  tenantId: string;
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

/**
 * Document theo dõi chu kỳ tích luỹ Jackpot.
 * Mỗi cycle bắt đầu từ seedAmount và kết thúc khi có người trúng hoặc manual reset.
 * Mega 6/45 không có Split Cycle — Jackpot chỉ roll-over cho đến khi có winner.
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
   * Công thức: seedAmount + totalContribution.
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

  /** ID kỳ quay kết thúc chu kỳ. */
  endDrawId?: string;
  /** Thời điểm đóng chu kỳ. */
  closedAt?: Date;
  /** Lý do đóng chu kỳ (winner / manual_reset). */
  closeReason?: JackpotCycleCloseReason;

  /** Danh sách người trúng Jackpot (6/6 số) trong chu kỳ. */
  winners?: JackpotWinnerInfo[];

  /** Thời điểm tạo document. */
  createdAt: Date;
  /** Thời điểm cập nhật cuối cùng. */
  updatedAt: Date;
}
