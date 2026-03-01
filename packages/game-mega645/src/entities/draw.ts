/**
 * Mega 6/45 – Draw Document
 *
 * Collection: mega645Draws
 *
 * 1 document = 1 kỳ mở thưởng.
 * Game quay 3 lần/tuần (Thứ 4, Thứ 6, Chủ nhật) lúc 18:00.
 */

import type { DrawStatus } from "@megawin/game-core/entities";
import type { ISODateString, DrawNo, MainTuple, SplitRatios } from "./types";

// ─────────────────────────────────────────────
// Draw Document
// ─────────────────────────────────────────────

export interface DrawDoc {
  _id: unknown;

  /**
   * ID kỳ quay, unique + stable.
   * Format: "YYYY-MM-DD.001" (Mega 6/45 chỉ quay 1 kỳ/ngày).
   */
  drawId: string;

  /** Ngày quay "YYYY-MM-DD". */
  drawDate: ISODateString;

  /** Ngày tài chính "YYYY-MM-DD". */
  financialDate: ISODateString;

  /** Số thứ tự kỳ quay trong ngày (luôn = 1 cho Mega 6/45). */
  drawNo: DrawNo;

  /** Thời điểm quay chính xác. */
  drawTime: Date;

  /** Trạng thái vận hành. */
  status: DrawStatus;

  // ───── Sales Window ─────

  sales: {
    openAt?: Date;
    closeAt: Date;
  };

  // ───── Vietlott Reference ─────

  vietlottRef?: {
    drawPeriod: string;
    drawDate: ISODateString;
  };

  // ───── Result ─────

  /**
   * Kết quả kỳ quay.
   * Mega 6/45: chỉ có 6 số chính, KHÔNG có bonus/special number.
   */
  result?: {
    /** 6 số trúng thưởng, sorted tăng dần. */
    winningMain: MainTuple;

    publishedAt: Date;
  };

  // ───── Jackpot (snapshot – ghi khi settle) ─────

  jackpot?: {
    openingAmount: number;
    closingAmount: number;
    isSplitCycle?: boolean;
    split?: DrawSplit;
  };

  // ───── Financial Breakdown ─────

  financial?: {
    totalRevenue: number;
    totalFixedPrizes: number;
    totalAgentCommission: number;
    companyTake: number;
    companyTakeRate: number;
    companyTakeMax: number;
    jackpotContribution: number;
  };

  // ───── Stats ─────

  stats?: {
    ticketEntryCount: number;
    totalLineCount: number;
    totalSalesAmount: number;
    totalPayoutAmount?: number;
  };

  // ───── Void Info ─────

  voidInfo?: {
    reason: string;
    voidedBy?: string;
    voidedAt: Date;
  };

  voidSummary?: {
    totalVoidedEntries: number;
    totalOriginalAmount: number;
    totalRefundAmount: number;
    completedAt: Date;
  };

  // ───── Timestamps ─────

  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────
// Sub-types
// ─────────────────────────────────────────────

export interface DrawSplit {
  thresholdAmount: number;
  splitRatios: SplitRatios;
  splitAmount: number;
  tierAllocations?: Record<
    string,
    {
      initialAmount: number;
      redistributedAmount: number;
      totalAmount: number;
      winnerCount: number;
      bonusPerWinner: number;
    }
  >;
  roundingRemainder?: number;
  splitRuleVersion?: string;
  hintText?: string;
}
