/**
 * Max 3D Pro – Player DTOs
 *
 * Dữ liệu trả cho player qua API Gateway.
 * Chỉ chứa thông tin player cần — loại bỏ dữ liệu vận hành/công ty.
 */

import type { PrizeTier } from "@megawin/game-max3dpro/entities";
import type { EntryOutcome } from "@megawin/game-core/entities";

// ─── Get Current Draw (Player) ───

export interface PlayerGetCurrentDrawOutput {
  /** Kỳ quay active đầu tiên (backward compat), null nếu không có. */
  currentDraw: PlayerDrawInfo | null;
  /** Tất cả kỳ quay đang active, sorted drawDate+drawNo asc. */
  activeDraws: PlayerDrawInfo[];
}

export interface PlayerDrawInfo {
  /** ID kỳ quay. */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ quay trong ngày. */
  drawNo: number;
  /** Giờ quay (HH:mm). */
  drawTime: string;
  /** Trạng thái kỳ quay. */
  status: string;
  sales: {
    /** Thời điểm mở bán (ISO 8601). */
    openAt?: string;
    /** Thời điểm đóng bán (ISO 8601). */
    closeAt: string;
  };
}

// ─── List Tickets (Player) ───

export interface PlayerListTicketsInput {
  /** ID tenant. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** Số lượng tối đa mỗi trang. */
  size: number;
  /** Lọc từ ngày (YYYY-MM-DD). */
  from?: string;
  /** Lọc đến ngày (YYYY-MM-DD). */
  to?: string;
  /** Con trỏ phân trang (cursor-based). */
  cursor?: string;
}

/**
 * Input để lấy danh sách vé đang pending của player.
 *
 * Không có from/to — pending tickets trả về TẤT CẢ vé chưa settle/void,
 * sắp xếp mới nhất trước. Player không cần nhớ ngày mua; hệ thống tự trả đủ
 * qua cursor-based pagination.
 */
export interface PlayerListPendingTicketsInput {
  /** ID tenant. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** Số lượng tối đa mỗi trang. */
  size: number;
  /** Con trỏ phân trang (cursor-based). */
  cursor?: string;
}

export interface PlayerTicketSummary {
  /** MongoDB document ID. */
  id: string;
  /** Mã vé hiển thị (human-readable). */
  ticketNo: string;
  /** Trạng thái vé: paid → completed / refunded. */
  status: string;
  /** Kế hoạch tham gia các kỳ quay. */
  drawPlan: {
    /** Danh sách mã kỳ quay đã đăng ký. */
    drawIds: string[];
    /** Số kỳ quay tham gia = drawIds.length. */
    drawCount: number;
  };
  /**
   * Chi tiết giá vé.
   *
   * Công thức:
   * - linesPerDraw = Σ(board.lineCount)
   * - amountPerDraw = linesPerDraw × unitPrice
   * - totalAmount = amountPerDraw × drawCount
   */
  pricing: {
    /** Đơn giá 1 pair cho 1 kỳ (VND). */
    unitPrice: number;
    /** Tổng pairs mỗi kỳ = Σ(board.lineCount). */
    linesPerDraw: number;
    /** Giá mỗi kỳ (VND) = linesPerDraw × unitPrice. */
    amountPerDraw: number;
    /** Tổng tiền toàn vé (VND) = amountPerDraw × drawCount. */
    totalAmount: number;
  };
  /** Danh sách boards trên vé. */
  boards: Array<{
    /** Ký hiệu board: A, B, C, D. */
    boardNo: string;
    /** Cách chơi: basic / multiNumber / multiDigit. */
    playMode: string;
    /** Kiểu cược: direct / rumble. */
    playType: string;
    /** Danh sách bộ ba số. */
    triplets: string[];
    /** Các chữ số đầu (dùng cho multiNumber / multiDigit). */
    frontDigits?: number[];
    /** Các chữ số cuối (dùng cho multiNumber / multiDigit). */
    backDigits?: number[];
    /** Số pairs phát sinh từ board này. Với multiNumber: C(n,2). */
    lineCount: number;
  }>;
  /** Tiến trình settle qua các kỳ. settledDraws = số kỳ đã xử lý xong (settled + voided). */
  progress: {
    /** Tổng số kỳ đã đăng ký. */
    totalDraws: number;
    /** Số kỳ đã xử lý xong (settled + voided). */
    settledDraws: number;
  };
  /** Tổng kết trúng thưởng — chỉ có khi đã settle ít nhất 1 kỳ. */
  settlement?: {
    /** Tổng tiền thắng (VND) = Σ(entry.winAmount) qua tất cả kỳ. */
    totalWinAmount: number;
    /** Thời điểm kỳ gần nhất được settle (ISO 8601). */
    lastSettledAt?: string;
  };
  /**
   * Tóm tắt huỷ cược. Có khi ít nhất 1 kỳ của vé bị void.
   * Multi-draw: hoàn tiền một phần (kỳ bị void). Single-draw: hoàn toàn bộ → status = "refunded".
   */
  voidSummary?: {
    /** Tổng tiền cược gốc của các kỳ bị huỷ (VND). */
    totalVoidedAmount: number;
    /** Tổng tiền đã hoàn trả cho player (VND). */
    totalRefundedAmount: number;
    /** Số kỳ đã bị huỷ. */
    voidedDrawCount: number;
    /** Danh sách drawId của các kỳ đã bị huỷ. */
    voidedDrawIds: string[];
    /** Thời điểm kỳ gần nhất bị huỷ (ISO 8601). */
    lastVoidedAt?: string;
  };
  /** Thời điểm tạo vé (ISO 8601). */
  createdAt: string;
}

export interface PlayerListTicketsOutput {
  /** Danh sách vé. */
  tickets: PlayerTicketSummary[];
  /** Con trỏ trang tiếp, null nếu hết. */
  nextCursor: string | null;
  /** Kích thước trang thực tế. */
  size: number;
}

// ─── Get Ticket Entries (Player) ───

export interface PlayerGetTicketEntriesInput {
  /** ID tenant. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** ID vé cần lấy entries. */
  ticketId: string;
}

export interface PlayerEntryInfo {
  /** ID entry. */
  id: string;
  /** ID kỳ quay. */
  drawId: string;
  /** Trạng thái entry. */
  status: string;
  /** Tiền cược entry (VND). */
  amount: number;
  /** Số pairs = Σ(board.lineCount) trong entry. */
  lineCount: number;
  entrySummary: {
    /** Mã vé hiển thị. */
    ticketNo: string;
    boards: Array<{
      /** Số thứ tự board. */
      boardNo: string;
      /** Kiểu chơi. */
      playMode: string;
      /** Loại cược. */
      playType: string;
      /** Danh sách bộ ba số. */
      triplets: string[];
      /** Các số đầu (dùng cho multiNumber). */
      frontDigits?: number[];
      /** Các số cuối (dùng cho multiNumber). */
      backDigits?: number[];
      /** Số pairs trong board. */
      lineCount: number;
    }>;
  };
  result?: {
    /** Giải Đặc biệt: 2 bộ ba số. */
    special: string[];
    /** Giải Nhất: 4 bộ ba số. */
    first: string[];
    /** Giải Nhì: 6 bộ ba số. */
    second: string[];
    /** Giải Ba: 8 bộ ba số. */
    third: string[];
    /** Thời điểm công bố kết quả (ISO 8601). */
    publishedAt: string;
  };
  /** Kết quả tổng: 'win' | 'loss'. */
  outcome?: EntryOutcome;
  payout?: {
    /** Tổng tiền thắng (VND). */
    winAmount: number;
    /** Tổng tiền trả (VND). */
    payoutAmount: number;
    tiers: Array<{
      /** Tên tier giải. */
      tier: string;
      /** Số lần trúng tier. */
      hitCount: number;
      /** Tiền thưởng mỗi lần trúng (VND). */
      unitAmount: number;
      /** Tổng tiền tier = hitCount × unitAmount (VND). */
      amount: number;
    }>;
  };
}

export interface PlayerGetTicketEntriesOutput {
  /** Thông tin tổng hợp vé. */
  ticket: PlayerTicketSummary;
  /** Danh sách entries của vé. */
  entries: PlayerEntryInfo[];
}

// ─── Get Entry Lines (Player) ───

export interface PlayerGetEntryLinesInput {
  /** ID tenant. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** ID entry cần lấy lines. */
  entryId: string;
  /** Số lượng lines mỗi trang. */
  size: number;
  /** lineIndex của phần tử cuối cùng trang trước (cursor). */
  cursor?: number;
}

export interface PlayerLineInfo {
  /** Số board. */
  boardNo: string;
  /** Vị trí line trong entry (0-based). */
  lineIndex: number;
  /** Kiểu chơi. */
  playMode: string;
  /** Loại cược. */
  playType: string;
  /** Cặp hai bộ ba số của line. */
  triplets: string[];
  /** Kết quả so khớp. tier = null nếu không trúng. */
  matchResult: {
    tier: PrizeTier | null;
    winAmount: number;
  };
}

export interface PlayerGetEntryLinesOutput {
  /** ID entry. */
  entryId: string;
  /** ID kỳ quay. */
  drawId: string;
  /** Danh sách lines. */
  lines: PlayerLineInfo[];
  /** Cursor cho trang tiếp theo. Null nếu hết dữ liệu. */
  nextCursor: number | null;
  /** Kích thước trang. */
  size: number;
}

// ─── Draw Results (Player) ───

/** Thông tin giải thưởng 1 hạng trong kỳ quay — dùng cho GetDrawResult API. */
export interface PlayerDrawTierPrize {
  /**
   * Tên hạng giải: "special", "specialSub", "first", "second",
   * "third", "fourth", "fifth", "sixth".
   */
  tier: string;
  /** Số lượt trúng hạng này trong kỳ quay (tổng hit count). */
  winnerCount: number;
  /** Tổng tiền thưởng hạng này (VND). */
  prizeAmount: number;
}

/** Kết quả chi tiết 1 kỳ quay Max 3D Pro đã settle — dùng cho GetDrawResult API. */
export interface PlayerDrawResultInfo {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  /** Kết quả quay thưởng (20 bộ ba số, chia theo hạng giải). */
  result: {
    /** Giải Đặc Biệt (2 bộ ba số). */
    special: string[];
    /** Giải Nhất (4 bộ ba số). */
    first: string[];
    /** Giải Nhì (6 bộ ba số). */
    second: string[];
    /** Giải Ba (8 bộ ba số). */
    third: string[];
    /** Thời điểm công bố kết quả (ISO 8601). */
    publishedAt: string;
  };
  /** Bảng giải thưởng theo từng hạng — 8 tiers cho Max 3D Pro. */
  prizes: PlayerDrawTierPrize[];
  /** Tham chiếu kỳ quay Vietlott. */
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

/** Tóm tắt 1 kỳ quay trong danh sách — dùng cho ListDrawResults API. */
export interface PlayerDrawResultSummary {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  result: {
    special: string[];
    first: string[];
    second: string[];
    third: string[];
    publishedAt: string;
  };
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

export interface PlayerListDrawResultsInput {
  /** Lấy các kỳ trước ngày này (YYYY-MM-DD), inclusive. Mặc định = hôm nay. */
  from: string;
  /** Số kỳ tối đa mỗi trang. */
  size: number;
  /** Cursor từ response trước: drawId kỳ cuối trang. */
  cursor?: string;
}

export interface PlayerListDrawResultsOutput {
  draws: PlayerDrawResultSummary[];
  /** Cursor cho trang tiếp theo. Null nếu hết kết quả. */
  nextCursor: string | null;
  size: number;
}
