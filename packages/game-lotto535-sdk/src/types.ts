/**
 * Lotto 5/35 SDK – Public Types
 *
 * Types an toàn để tenant develop client SDK.
 * KHÔNG expose: internal Doc types, expansion strategy, audit fields,
 * selectionHash, settlement internals, financial breakdown.
 */

import type {
  Lotto535PlayType,
  Lotto535PrizeTier,
  Lotto535TicketDisplayStatus,
} from "./enums";

// ─────────────────────────────────────────────
// Input Types (mua vé)
// ─────────────────────────────────────────────

/** Input lựa chọn số cho 1 board. */
export interface BoardInput {
  /** Mã board: "A", "B", "C", "D", "E". */
  boardNo: string;

  /** Kiểu chơi. */
  playType: Lotto535PlayType;

  /** Danh sách số chính (1-35), unique. */
  mainNumbers: number[];

  /** Danh sách số đặc biệt (1-12), unique. */
  specialNumbers: number[];
}

/** Input mua vé. */
export interface TicketPurchaseInput {
  /** Danh sách boards (tối đa 5). */
  boards: BoardInput[];

  /** DrawId kỳ đầu tiên tham gia. */
  startDrawId: string;

  /** Số kỳ tham gia liên tiếp (1-6). */
  drawCount: number;
}

// ─────────────────────────────────────────────
// Response Types (hiển thị)
// ─────────────────────────────────────────────

/** Thông tin kỳ quay cho UI người chơi. */
export interface DrawInfo {
  /** ID kỳ quay. */
  drawId: string;

  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;

  /** Số thứ tự: 1 = 13h, 2 = 21h. */
  drawNo: number;

  /** Thời điểm quay. */
  drawTime: string;

  /** Trạng thái đơn giản cho UI. */
  status: "upcoming" | "open" | "closed" | "completed";

  /** Thời điểm đóng bán. */
  salesCloseAt: string;

  /** Giá trị Jackpot hiện tại (VND). */
  jackpotAmount: number;

  /** Kỳ quay này có phải kỳ chia giải không. */
  isSplitCycle?: boolean;

  /** Tham chiếu kỳ quay Vietlott. */
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
    drawSession: number;
  };
}

/** Kết quả kỳ quay cho UI. */
export interface DrawResult {
  /** 5 số chính trúng thưởng. */
  winningMain: number[];

  /** 1 số đặc biệt trúng thưởng. */
  winningSpecial: number;

  /** Thời điểm công bố. */
  publishedAt: string;
}

/** Tóm tắt vé cho UI người chơi. */
export interface TicketSummary {
  /** ID vé. */
  ticketId: string;

  /** Mã vé hiển thị. */
  ticketNo: string;

  /** Trạng thái hiển thị. */
  status: Lotto535TicketDisplayStatus;

  /** Tổng tiền vé (VND). */
  totalAmount: number;

  /** Số kỳ tham gia. */
  drawCount: number;

  /** Số kỳ đã settle. */
  settledDraws: number;

  /** Tổng tiền thắng (nếu có). */
  totalWinAmount?: number;

  /** Danh sách boards. */
  boards: BoardSummary[];

  /** Ngày mua. */
  createdAt: string;
}

/** Tóm tắt 1 board cho UI. */
export interface BoardSummary {
  boardNo: string;
  playType: Lotto535PlayType;
  mainNumbers: number[];
  specialNumbers: number[];
  expandedLines: number;
}

/** Kết quả entry (vé 1 kỳ) cho UI. */
export interface EntryResult {
  /** DrawId. */
  drawId: string;

  /** Ngày quay. */
  drawDate: string;

  /** Trạng thái: chờ quay, đã có kết quả, đã tính thưởng. */
  status: "pending" | "drawn" | "settled";

  /** Tiền cược kỳ này. */
  amount: number;

  /** Kết quả quay (nếu đã có). */
  result?: DrawResult;

  /** Chi tiết trúng thưởng (nếu đã settle). */
  payout?: EntryPayoutSummary;
}

/** Tóm tắt trả thưởng entry. */
export interface EntryPayoutSummary {
  /** Tổng tiền thắng kỳ này. */
  winAmount: number;

  /** Chi tiết theo hạng giải. */
  tiers: Array<{
    tier: Lotto535PrizeTier;
    label: string;
    hitCount: number;
    /** Tiền thưởng cố định (base). */
    amount: number;
    /**
     * Bonus từ chia Jackpot (nếu kỳ split cycle).
     * Tổng thưởng = amount + (splitBonus ?? 0).
     */
    splitBonus?: number;
    /**
     * true nếu line này trúng Jackpot (5 chính + ĐB).
     * Dùng cho UI ghi "Jackpot" thay vì giá trị cố định.
     */
    isJackpot?: boolean;
  }>;
}

/** Thông tin 1 hạng giải (cho trang hướng dẫn chơi). */
export interface PrizeTierInfo {
  /** Mã tier. */
  tier: Lotto535PrizeTier;

  /** Tên tiếng Việt. */
  label: string;

  /** Mô tả điều kiện trúng. */
  description: string;

  /** Giá trị giải thưởng cố định (VND). 0 = tích luỹ (Jackpot). */
  amount: number;

  /**
   * true nếu giải thưởng = Jackpot (tích luỹ, hiển thị logo + giá trị hiện tại).
   * UI nên ghi: "Jackpot" hoặc "Jackpot + {baoBonusHint}" khi chơi bao.
   */
  isJackpot?: boolean;

  /**
   * true nếu tier tham gia chia Jackpot khi split cycle.
   * UI nên ghi note: "(*) Được bổ sung thêm tại kỳ Chia Giải Độc Đắc".
   */
  eligibleForSplit?: boolean;
}

/**
 * Thông tin split cycle hiển thị cho người chơi.
 * Trả kèm DrawInfo khi kỳ quay là split cycle.
 */
export interface SplitCycleInfo {
  /** Giá trị Jackpot đang chia (VND). */
  splitAmount: number;

  /**
   * Bonus dự kiến cho từng tier (VND mỗi giải trúng).
   * Giá trị thực tế phụ thuộc số người trúng (chỉ xác định sau settle).
   * Đây là giá trị tham khảo khi chỉ có 1 winner mỗi tier.
   */
  estimatedBonusPerTier: Partial<Record<Lotto535PrizeTier, number>>;
}
