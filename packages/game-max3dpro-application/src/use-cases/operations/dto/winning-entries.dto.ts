/**
 * Max 3D Pro – Winning Entries DTO
 *
 * Danh sách entries trúng thưởng của một kỳ quay, kèm chi tiết kế toán.
 * Dùng cho dialog báo cáo trên trang operations backoffice.
 *
 * Max 3D Pro đặc thù:
 * - 1 PrizeTier enum duy nhất (8 hạng: special, specialSub, first-sixth).
 * - isDuplicate: 2 bộ ba giống nhau → giải thưởng × 2.
 * - boards chứa TripletPair (ordered pair) thay vì triplet đơn.
 * - multiDigit board có frontDigits + backDigits.
 */

import type { PrizeTier } from "@megawin/game-max3dpro/entities";

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
  /** Hạng giải — 1 trong 8 PrizeTier (special/specialSub/first-sixth). */
  tier: PrizeTier;
  /** Label hiển thị tiếng Việt (e.g. "Giải phụ Đặc Biệt"). */
  tierLabel: string;
  /** Số cặp trúng hạng này. */
  hitCount: number;
  /** Giá trị 1 cặp trúng (VND). Đã nhân 2 nếu isDuplicate. */
  unitAmount: number;
  /** Tổng tiền = hitCount × unitAmount (VND). */
  amount: number;
}

export interface WinningEntryBoard {
  /** Ký hiệu board: A, B, C, D. */
  boardNo: string;
  /** Cách chơi: multiNumber / multiDigit. */
  playMode: string;
  /** Kiểu chơi: straight. */
  playType: string;
  /**
   * Danh sách bộ ba số.
   * multiNumber: 3-20 bộ ba.
   * multiDigit: expand từ frontDigits × backDigits.
   */
  triplets: string[];
  /** Chỉ multiDigit: 3 chữ số đầu người chơi chọn. */
  frontDigits?: number[];
  /** Chỉ multiDigit: 3 chữ số sau người chơi chọn. */
  backDigits?: number[];
  /** Số cặp TripletPair expand ra từ board. */
  lineCount: number;
  /**
   * Số lần cược nhân bội (≥ 1).
   * Tiền thưởng board = prizeConfig[tier] × lineCount × betCount.
   */
  betCount: number;
  /**
   * Max 3D Pro: 2 bộ ba giống nhau (chỉ áp dụng khi lineCount cặp có triplet đầu = triplet sau).
   * Khi true → giải thưởng × 2.
   */
  isDuplicate?: boolean;
}

export interface WinningEntryItem {
  entryId: string;
  username: string;
  tenantId: string;
  /** Tổng TripletPair lines cược (không tính betCount). */
  lineCount: number;
  /**
   * Tổng đơn vị cược = Σ(board.lineCount × board.betCount).
   * amount = betUnitCount × unitPrice.
   */
  betUnitCount: number;
  /** Tiền cược (VND). */
  amount: number;
  /** Tổng tiền trúng thưởng (VND). Đã nhân betCount. */
  winAmount: number;
  /** Boards (bộ ba số và cách chơi). */
  boards: WinningEntryBoard[];
  /** Chi tiết trúng từng hạng giải (8 hạng). */
  tiers: WinningEntryTierDetail[];
  /** Thời điểm đặt cược (ISO 8601). */
  createdAt: string;
  /** Thời điểm settle (ISO 8601). */
  settledAt: string;
}

export interface WinningEntriesSummary {
  /** Tổng số entries trúng. */
  totalWinningEntries: number;
  /** Tổng cặp trúng (sum of all hitCount across all tiers). */
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
