/**
 * Lotto 5/35 – Jackpot Cycle Document
 *
 * Collection: lotto535_jackpot_cycles
 *
 * 1 cycle = 1 vòng đời Jackpot, từ khi seed/reset → đến khi có winner hoặc chia.
 * Tại mỗi thời điểm chỉ có duy nhất 1 cycle ở trạng thái "active".
 *
 * Dùng để:
 * - Xem nhanh trạng thái Jackpot hiện tại (active cycle)
 * - Lịch sử chia giải / trúng Jackpot (closed cycles)
 * - Thống kê: bao nhiêu kỳ tích lũy, peak amount, v.v.
 */

import type { ISODateString, SplitRatios } from "./types";

// ─────────────────────────────────────────────
// Jackpot Cycle Status
// ─────────────────────────────────────────────

export const JackpotCycleStatus = {
  Active: "active",
  Closed: "closed",
} as const;

export type JackpotCycleStatus =
  (typeof JackpotCycleStatus)[keyof typeof JackpotCycleStatus];

// ─────────────────────────────────────────────
// Jackpot Cycle Close Reason
// ─────────────────────────────────────────────

export const JackpotCycleCloseReason = {
  /** Jackpot chia giải khi đạt ngưỡng, không ai trúng Jackpot. */
  Split: "split",
  /** Có người trúng giải Jackpot. */
  Winner: "winner",
  /** Admin reset thủ công. */
  ManualReset: "manual_reset",
} as const;

export type JackpotCycleCloseReason =
  (typeof JackpotCycleCloseReason)[keyof typeof JackpotCycleCloseReason];

// ─────────────────────────────────────────────
// Winner Detail
// ─────────────────────────────────────────────

/** Thông tin người trúng Jackpot. */
export interface JackpotWinnerInfo {
  /** ID tài khoản người chơi. */
  accountId: string;
  /** Username hiển thị. */
  username?: string;
  /** ID tenant / đại lý. */
  tenantId: string;
  /** Tên tenant (snapshot). */
  tenantName?: string;
  /** Số tiền trúng. */
  prizeAmount: number;
  /** ID entry trúng giải. */
  entryId: string;
  /** ID draw trúng giải. */
  drawId: string;
}

// ─────────────────────────────────────────────
// Jackpot Cycle Document
// ─────────────────────────────────────────────

export interface JackpotCycleDoc {
  _id: unknown;

  /** Mã cycle, auto-increment format "JP-NNN". */
  cycleNo: number;

  /** Trạng thái: active / closed. */
  status: JackpotCycleStatus;

  // ───── Điểm bắt đầu ─────

  /** DrawId đầu tiên của cycle. */
  startDrawId: string;

  /** Thời điểm bắt đầu cycle. */
  startedAt: Date;

  /** Số tiền khởi điểm (seedAmount snapshot). */
  seedAmount: number;

  // ───── Thống kê tích lũy ─────

  /** Jackpot hiện tại (= draw settled mới nhất trong cycle). */
  currentAmount: number;

  /** Giá trị Jackpot cao nhất đạt được trong cycle. */
  peakAmount: number;

  /** Tổng tiền tích lũy từ đầu cycle. */
  totalContribution: number;

  /** Số kỳ đã settled trong cycle. */
  drawCount: number;

  /** DrawId đã settled gần nhất trong cycle. */
  lastSettledDrawId?: string;

  // ───── Cấu hình snapshot ─────

  /** Cấu hình Jackpot tại thời điểm tạo cycle. */
  config: {
    splitThreshold: number;
    splitRatios: SplitRatios;
  };

  // ───── Kết thúc (khi status = closed) ─────

  /** DrawId kết thúc cycle (draw chia hoặc draw có winner). */
  endDrawId?: string;

  /** Thời điểm đóng cycle. */
  closedAt?: Date;

  /** Lý do đóng: split / winner / manual_reset. */
  closeReason?: JackpotCycleCloseReason;

  /** Chi tiết chia giải (khi closeReason = split). */
  splitDetail?: {
    splitAmount: number;
    tierAllocations: Record<
      string,
      {
        winnerCount: number;
        bonusPerWinner: number;
        totalAmount: number;
      }
    >;
    totalWinners: number;
    totalPaid: number;
  };

  /**
   * Danh sách người trúng Jackpot (khi closeReason = winner).
   * Có thể nhiều người cùng trúng 1 kỳ.
   */
  winners?: JackpotWinnerInfo[];

  // ───── Timestamps ─────

  createdAt: Date;
  updatedAt: Date;
}
