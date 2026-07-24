/**
 * Power 6/55 – Winning Entries DTO
 *
 * Danh sách entries trúng thưởng của một kỳ quay, kèm chi tiết kế toán.
 * Power 6/55: 6 tiers (jackpot1, jackpot2, tier1, tier2, tier3, tier4).
 */

import type { PlayType, PrizeTier } from "@megawin/game-power655/entities";

export interface GetWinningEntriesInput {
  drawId: string;
  cursor?: string;
  limit?: number;
}

export interface WinningEntryTierDetail {
  tier: PrizeTier;
  tierLabel: string;
  hitCount: number;
  unitAmount: number;
  amount: number;
}

export interface WinningEntryBoard {
  boardNo: string;
  playType: PlayType;
  /** Số chính (01-55, zero-padded). */
  mainNumbers: string[];
  expandedLines: number;
}

export interface WinningEntryItem {
  entryId: string;
  username: string;
  tenantId: string;
  lineCount: number;
  amount: number;
  winAmount: number;
  boards: WinningEntryBoard[];
  /**
   * 6 số chính kết quả kỳ quay (01-55, zero-padded) — snapshot lúc settle.
   * Dùng highlight số trúng khi đối chiếu với board.mainNumbers.
   */
  winningMain: string[];
  /** Bonus number kỳ quay (01-55, zero-padded). Rỗng nếu chưa có kết quả. */
  bonusNumber: string;
  tiers: WinningEntryTierDetail[];
  createdAt: string;
  settledAt: string;
}

export interface WinningEntriesSummary {
  totalWinningEntries: number;
  totalWinningLines: number;
  totalWinAmount: number;
}

export interface GetWinningEntriesOutput {
  drawId: string;
  entries: WinningEntryItem[];
  summary: WinningEntriesSummary;
  nextCursor: string | null;
}
