/**
 * Bingo 18 – Winning Entries DTO
 *
 * Danh sách entries trúng thưởng của một kỳ quay, kèm chi tiết.
 * Bingo 18: boards[] chứa cả cơ bản và bổ sung.
 *   - Cơ bản: matchCount (singleNum: 1/2/3) + tripleKind? + winAmount
 *   - Bổ sung: sum/bet + outcome + isWin + winAmount, matchCount = null
 *   - KHÔNG có payout cap (giải cố định)
 *   - Outcome tổng hợp: "win" | "partial_win"
 */

import type {
  Bingo18PlayType,
  Bingo18BigSmallBet,
  Bingo18TripleKind,
} from "@megawin/game-bingo18/entities";

// ─── Input ────────────────────────────────────────────────────────────────────

export interface GetWinningEntriesInput {
  drawId: string;
  /** Cursor-based pagination — entryId của record cuối trang trước. */
  cursor?: string;
  /** Số records mỗi trang, mặc định 50, tối đa 200. */
  limit?: number;
}

// ─── Output ───────────────────────────────────────────────────────────────────

/**
 * Chi tiết kết quả một board trúng thưởng — cả cơ bản và bổ sung.
 *
 * Cơ bản:
 *   singleNum: matchCount = 1/2/3 (trúng 1/2/3 lần).
 *   doubleMatch: matchCount = 1 (trúng hoặc không).
 *   tripleMatch: matchCount = 1 + tripleKind phân biệt specific/any.
 *
 * Bổ sung:
 *   sumTotal: sum + outcome + isWin, matchCount = null.
 *   bigSmallDraw: bet + outcome + isWin, matchCount = null.
 */
export interface WinningBoardDetail {
  /** Mã board (format "B01", "B02",...). */
  boardNo: string;
  /** Loại cược: singleNum | doubleMatch | tripleMatch | sumTotal | bigSmallDraw. */
  playType: Bingo18PlayType;
  /** Số đã chọn (1-6). undefined với tripleMatch-any, sumTotal, bigSmallDraw. */
  number?: number;
  /**
   * Phân loại triple: "specific" hoặc "any".
   * Cần để phân biệt 1.2tr vs 200k.
   */
  tripleKind?: Bingo18TripleKind;
  /**
   * Số lần xuất hiện trong kết quả quay.
   * singleNum: 1/2/3 → giải khác nhau (12k/20k/30k).
   * doubleMatch + tripleMatch: 2-3 (trúng).
   * Bổ sung (sumTotal/bigSmallDraw): null — field không áp dụng.
   */
  matchCount: number | null;
  /** Tổng đã chọn (3-18). Chỉ set cho sumTotal. */
  sum?: number;
  /** Cược lớn/hòa/nhỏ. Chỉ set cho bigSmallDraw. */
  bet?: Bingo18BigSmallBet;
  /** Kết quả thực tế. Chỉ set cho bổ sung (sumTotal/bigSmallDraw). */
  outcome?: string;
  /** Player thắng hay không. Set cho tất cả play types. */
  isWin: boolean;
  /** Tiền thắng board này (VND). */
  winAmount: number;
}

export interface WinningEntryItem {
  entryId: string;
  username: string;
  tenantId: string;
  /** Tổng tiền cược (VND). */
  amount: number;
  /** Tổng tiền trúng thưởng (VND). */
  winAmount: number;
  /** 3 số kết quả kỳ quay (1-6) — snapshot gắn vào entry lúc settle. Dùng highlight số trúng. */
  winningNumbers: number[];
  /** Tổng 3 số kết quả (3-18). Dùng đối chiếu sumTotal/bigSmallDraw. */
  drawSum: number;
  /** Chi tiết từng board trúng (cả cơ bản và bổ sung). */
  boardDetails: WinningBoardDetail[];
  /** Thời điểm đặt cược. */
  createdAt: string;
  /** Thời điểm settle. */
  settledAt: string;
}

export interface WinningEntriesSummary {
  /** Tổng số entries trúng. */
  totalWinningEntries: number;
  /** Tổng tiền thưởng (VND). */
  totalWinAmount: number;
}

export interface GetWinningEntriesOutput {
  drawId: string;
  entries: WinningEntryItem[];
  summary: WinningEntriesSummary;
  nextCursor: string | null;
}
