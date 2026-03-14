/**
 * Max 3D – Winning Entries DTO
 *
 * Danh sách entries trúng thưởng của một kỳ quay, kèm chi tiết kế toán.
 * Dùng cho dialog báo cáo trên trang operations backoffice.
 *
 * Max 3D đặc thù:
 * - tier là BasicPrizeTier (4 hạng) hoặc PlusPrizeTier (7 hạng) — 2 enum tách biệt.
 * - isDuplicate: plus mode có 2 bộ ba giống nhau → giải thưởng × 2.
 * - boards chứa triplets thay vì mainNumbers + specialNumbers.
 */

import type { BasicPrizeTier, PlusPrizeTier } from "@megawin/game-max3d/entities";

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
  /** Hạng giải — BasicPrizeTier hoặc PlusPrizeTier. */
  tier: BasicPrizeTier | PlusPrizeTier;
  /** Label hiển thị tiếng Việt. */
  tierLabel: string;
  /** Số lần trúng hạng này. */
  hitCount: number;
  /** Giá trị 1 lần trúng (VND). */
  unitAmount: number;
  /** Tổng tiền = hitCount × unitAmount (VND). */
  amount: number;
}

export interface WinningEntryBoard {
  /** Ký hiệu board: A, B, C, D. */
  boardNo: string;
  /** Cách chơi: basic / plus. */
  playMode: string;
  /** Kiểu chơi: straight / combo3 / combo6 / quickPick. */
  playType: string;
  /**
   * Bộ ba số.
   * - basic: 1 triplet
   * - plus: 2 triplets
   */
  triplets: string[];
  /** Số lines của board. */
  lineCount: number;
  /**
   * Plus mode: cả 2 bộ ba giống nhau → giải thưởng × 2.
   * Chỉ có ý nghĩa khi playMode = "plus".
   */
  isDuplicate?: boolean;
}

export interface WinningEntryItem {
  entryId: string;
  username: string;
  tenantId: string;
  /** Tổng lines cược. */
  lineCount: number;
  /** Tiền cược (VND). */
  amount: number;
  /** Tổng tiền trúng thưởng (VND). */
  winAmount: number;
  /** Boards (bộ ba số). */
  boards: WinningEntryBoard[];
  /** Chi tiết trúng từng hạng giải. */
  tiers: WinningEntryTierDetail[];
  /** Thời điểm đặt cược (ISO 8601). */
  createdAt: string;
  /** Thời điểm settle (ISO 8601). */
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
