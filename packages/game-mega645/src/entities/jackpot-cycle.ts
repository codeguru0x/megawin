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

export type JackpotCycleStatus =
  (typeof JackpotCycleStatus)[keyof typeof JackpotCycleStatus];

export const JackpotCycleCloseReason = {
  Split: "split",
  Winner: "winner",
  ManualReset: "manual_reset",
} as const;

export type JackpotCycleCloseReason =
  (typeof JackpotCycleCloseReason)[keyof typeof JackpotCycleCloseReason];

export interface JackpotWinnerInfo {
  accountId: string;
  username?: string;
  tenantId: string;
  tenantName?: string;
  prizeAmount: number;
  entryId: string;
  drawId: string;
}

export interface JackpotCycleDoc {
  _id: unknown;

  cycleNo: number;
  status: JackpotCycleStatus;

  startDrawId: string;
  startedAt: Date;
  seedAmount: number;

  currentAmount: number;
  peakAmount: number;
  totalContribution: number;
  drawCount: number;
  lastSettledDrawId?: string;

  config: {
    splitThreshold: number;
    splitRatios: SplitRatios;
  };

  endDrawId?: string;
  closedAt?: Date;
  closeReason?: JackpotCycleCloseReason;

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

  winners?: JackpotWinnerInfo[];

  createdAt: Date;
  updatedAt: Date;
}
