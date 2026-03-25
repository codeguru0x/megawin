/**
 * Mega 6/45 – Winning Entries DTO
 *
 * Danh sách entries trúng thưởng của một kỳ quay, kèm chi tiết kế toán.
 * Dùng cho dialog báo cáo trên trang operations backoffice.
 *
 * Mega 6/45 khác Lotto 5/35: board không có specialNumbers.
 */

import type { PlayType, PrizeTier } from "@megawin/game-mega645/entities";

// ─── Input ────────────────────────────────────────────────────────────────────

export interface GetWinningEntriesInput {
  drawId: string;
  /** Cursor-based pagination. */
  cursor?: string;
  /** Số records mỗi trang, mặc định 50, tối đa 200. */
  limit?: number;
}

// ─── Output ───────────────────────────────────────────────────────────────────

export interface WinningEntryTierDetail {
  tier: PrizeTier;
  tierLabel: string;
  hitCount: number;
  unitAmount: number;
  amount: number;
}

/** Board (bộ số) của entry — Mega 6/45 không có specialNumbers. */
export interface WinningEntryBoard {
  boardNo: string;
  playType: PlayType;
  /** Các số chính đã chọn (01-45, zero-padded). */
  numbers: string[];
  /** Số lines expanded của board này. */
  expandedLines: number;
}

export interface WinningEntryItem {
  entryId: string;
  username: string;
  tenantId: string;
  /** Số lines cược trong kỳ. */
  lineCount: number;
  /** Tiền cược (VND). */
  amount: number;
  /** Tổng tiền trúng thưởng (VND). */
  winAmount: number;
  /** Boards (số chơi). */
  boards: WinningEntryBoard[];
  /** Chi tiết trúng từng hạng giải. */
  tiers: WinningEntryTierDetail[];
  /** Thời điểm đặt cược. */
  createdAt: string;
  /** Thời điểm settle. */
  settledAt: string;
}

export interface WinningEntriesSummary {
  /** Tổng số entries trúng. */
  totalWinningEntries: number;
  /** Tổng lines trúng (sum of all hitCount across all tiers). */
  totalWinningLines: number;
  /** Tổng tiền thưởng (VND). */
  totalWinAmount: number;
}

export interface GetWinningEntriesOutput {
  drawId: string;
  entries: WinningEntryItem[];
  summary: WinningEntriesSummary;
  nextCursor: string | null;
}
