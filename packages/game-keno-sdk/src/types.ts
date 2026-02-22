/**
 * Keno SDK – Public Types
 *
 * Types an toàn để tenant develop client SDK.
 */

import type {
  Currency,
  KenoBigSmallBet,
  KenoEvenOddBet,
  KenoPlayType,
  KenoTicketDisplayStatus,
} from "./enums";

// ─────────────────────────────────────────────
// Input Types (mua vé)
// ─────────────────────────────────────────────

/** Input board cơ bản (chọn 1-10 số). */
export interface KenoBasicBoardInput {
  boardNo: string;
  numbers: number[];
}

/** Input side bet (cược bổ sung). */
export interface KenoSideBetInput {
  playType: typeof KenoPlayType.BigSmall | typeof KenoPlayType.EvenOdd;
  bet: KenoBigSmallBet | KenoEvenOddBet;
}

/** Input mua vé Keno. */
export interface KenoTicketPurchaseInput {
  /** Boards cơ bản (Panel A/B, tối đa 2). */
  boards: KenoBasicBoardInput[];

  /** Side bets (Panel C, tùy chọn). */
  sideBets?: KenoSideBetInput[];

  /** DrawId kỳ đầu tiên. */
  startDrawId: string;

  /** Số kỳ tham gia liên tiếp (1-20). */
  drawCount: number;
}

// ─────────────────────────────────────────────
// Response Types
// ─────────────────────────────────────────────

/** Thông tin kỳ quay Keno cho UI. */
export interface KenoDrawInfo {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  status: "upcoming" | "open" | "closed" | "completed";
  salesCloseAt: string;

  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

/** Kết quả kỳ quay Keno cho UI. */
export interface KenoDrawResult {
  /** 20 số trúng thưởng. */
  winningNumbers: number[];
  publishedAt: string;

  /** Derived stats. */
  bigCount: number;
  smallCount: number;
  evenCount: number;
  oddCount: number;
}

/** Tóm tắt vé Keno cho UI. */
export interface KenoTicketSummary {
  ticketId: string;
  ticketNo: string;
  status: KenoTicketDisplayStatus;
  currency: Currency;
  totalAmount: number;
  drawCount: number;
  settledDraws: number;
  totalWinAmount?: number;

  boards: KenoBasicBoardSummary[];
  sideBets: KenoSideBetSummary[];

  createdAt: string;
}

export interface KenoBasicBoardSummary {
  boardNo: string;
  playType: KenoPlayType;
  numbers: number[];
}

export interface KenoSideBetSummary {
  playType: KenoPlayType;
  bet: KenoBigSmallBet | KenoEvenOddBet;
}

/** Kết quả entry (vé 1 kỳ) cho UI. */
export interface KenoEntryResult {
  drawId: string;
  drawDate: string;
  status: "pending" | "drawn" | "settled";
  amount: number;
  result?: KenoDrawResult;
  payout?: KenoEntryPayoutSummary;
}

export interface KenoEntryPayoutSummary {
  winAmount: number;

  boardResults: Array<{
    boardNo: string;
    matchCount: number;
    pickCount: number;
    winAmount: number;
    matchedNumbers: number[];
  }>;

  sideBetResults: Array<{
    playType: KenoPlayType;
    bet: KenoBigSmallBet | KenoEvenOddBet;
    outcome: string;
    isWin: boolean;
    winAmount: number;
  }>;
}

/** Bảng giải thưởng cho trang hướng dẫn chơi. */
export interface KenoPrizeTableInfo {
  /** Bảng giải cơ bản: pickCount → matchCount → prize. */
  basicPrizes: Record<number, Record<number, number>>;

  /** Bảng giải Lớn/Nhỏ. */
  bigSmallPrizes: Array<{
    condition: string;
    prize: number;
  }>;

  /** Bảng giải Chẵn/Lẻ. */
  evenOddPrizes: Array<{
    condition: string;
    prize: number;
  }>;
}
