/**
 * Max 3D – Player DTOs
 *
 * Dữ liệu trả cho player qua API Gateway.
 * Chỉ chứa thông tin player cần — loại bỏ dữ liệu vận hành/công ty.
 */

import type {
  DrawSettleSummaryTier,
  EntrySummary,
  EntryPayoutTier,
} from "@megawin/game-max3d/entities";
import { EntryOutcome } from "@megawin/game-core/entities";

export type { DrawSettleSummaryTier as PlayerDrawTierPrize };

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
  /** Giờ quay dự kiến (ISO 8601). */
  drawTime: string;
  /** Trạng thái kỳ quay (scheduled / salesOpen / salesClosed / …). */
  status: string;
  sales: {
    /** Thời điểm mở bán (ISO 8601), undefined nếu chưa xác định. */
    openAt?: string;
    /** Thời điểm đóng bán (ISO 8601). */
    closeAt: string;
  };
}

// ─── List Tickets (Player) ───

export interface PlayerListTicketsInput {
  /** ID đại lý / tenant. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** Số lượng vé trả về mỗi trang. */
  size: number;
  /** Lọc từ ngày (YYYY-MM-DD), bao gồm. */
  from?: string;
  /** Lọc đến ngày (YYYY-MM-DD), bao gồm. */
  to?: string;
  /** Con trỏ phân trang (cursor-based pagination). */
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
  /** ID đại lý / tenant. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** Số lượng vé trả về mỗi trang. */
  size: number;
  /** Con trỏ phân trang (cursor-based pagination). */
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
   * - betUnitsPerDraw = Σ(board.lineCount × board.betCount)
   * - amountPerDraw = betUnitsPerDraw × unitPrice
   * - totalAmount = amountPerDraw × drawCount
   */
  pricing: {
    /** Đơn giá 1 line cho 1 kỳ (VND). */
    unitPrice: number;
    /** Tổng lines mỗi kỳ = Σ(board.lineCount). Dùng cho settle/matching. */
    linesPerDraw: number;
    /**
     * Tổng đơn vị cược mỗi kỳ = Σ(board.lineCount × board.betCount). Dùng tính tiền.
     * Backward compat: undefined cho vé cũ → fallback = linesPerDraw.
     */
    betUnitsPerDraw?: number;
    /** Giá mỗi kỳ (VND) = betUnitsPerDraw × unitPrice. */
    amountPerDraw: number;
    /** Tổng tiền toàn vé (VND) = amountPerDraw × drawCount. */
    totalAmount: number;
  };
  /** Danh sách boards trên vé. */
  boards: Array<{
    /** Ký hiệu board: A, B, C, D. */
    boardNo: string;
    /** Cách chơi: basic / plus. */
    playMode: string;
    /** Kiểu chơi: straight / combo3 / combo6. */
    playType: string;
    /** Bộ ba số đã chọn. */
    triplets: string[];
    /** Số lines phát sinh từ board này. straight=1, combo3=3, combo6=6. */
    lineCount: number;
    /**
     * Số lần cược nhân bội (≥ 1). Tiền cược board = lineCount × betCount × unitPrice.
     * Backward compat: undefined cho vé cũ (betCount = 1 ngầm định).
     */
    betCount: number;
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
  /** Con trỏ trang tiếp theo, null nếu hết dữ liệu. */
  nextCursor: string | null;
  /** Số lượng vé trả về. */
  size: number;
}

// ─── Get Ticket Entries (Player) ───

export interface PlayerGetTicketEntriesInput {
  /** ID đại lý / tenant. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** ID vé cần xem chi tiết entries. */
  ticketId: string;
}

// ─── Get Ticket Entries (Player) ───

export interface PlayerEntryInfo {
  /** ID entry. */
  id: string;
  /** ID kỳ quay tương ứng. */
  drawId: string;
  /** Trạng thái entry (pending / won / lost / …). */
  status: string;
  /** Tiền cược của entry (VND) = betUnitCount × unitPrice. */
  amount: number;
  /** Mệnh giá 1 lần tham gia dự thưởng (VND). Thường là 10.000đ. */
  unitPrice: number;
  /** Số lines = Σ(board.lineCount) trong entry. */
  lineCount: number;
  /**
   * Tổng đơn vị cược = Σ(board.lineCount × board.betCount).
   * amount = betUnitCount × unitPrice.
   */
  betUnitCount: number;
  /** Tóm tắt entry (thông tin vé + boards). */
  entrySummary: EntrySummary;
  /** Kết quả kỳ quay (chỉ có sau khi công bố). */
  result?: {
    /** Giải đặc biệt (2 bộ ba số). */
    special: string[];
    /** Giải nhất (4 bộ ba số). */
    first: string[];
    /** Giải nhì (6 bộ ba số). */
    second: string[];
    /** Giải ba (8 bộ ba số). */
    third: string[];
    /** Thời điểm công bố kết quả (ISO 8601). */
    publishedAt: string;
  };
  /** Kết quả tổng thể của entry (won / lost / pending). */
  outcome?: EntryOutcome;
  /** Chi tiết thanh toán (chỉ có khi đã settle). */
  payout?: {
    /** Tổng tiền thắng (VND). */
    winAmount: number;
    /** Số tiền thực nhận (VND). */
    payoutAmount: number;
    /** Chi tiết thắng theo từng giải. */
    tiers: EntryPayoutTier[];
  };
}

export interface PlayerGetTicketEntriesOutput {
  /** Danh sách entries của vé. */
  entries: PlayerEntryInfo[];
}

// ─── Get Entry Lines (Player) ───

export interface PlayerGetEntryLinesInput {
  /** ID đại lý / tenant. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** ID entry cần xem chi tiết lines. */
  entryId: string;
  /** Số lines mỗi trang. */
  size: number;
  /** lineIndex của phần tử cuối cùng trang trước (cursor). */
  cursor?: number;
}

export interface PlayerLineInfo {
  /** Số thứ tự board (vd: "A", "B"). */
  boardNo: string;
  /** Vị trí line trong board (0-based). */
  lineIndex: number;
  /** Kiểu chơi: basic | combo | plus. */
  playMode: string;
  /** Loại cược: direct | rumble. */
  playType: string;
  /** Bộ ba số của line. */
  triplets: string[];
  /**
   * Số lần tham gia dự thưởng của line này (≥ 1).
   * winAmount = unitPrize × betCount. UI hiển thị "×N" khi betCount > 1.
   */
  betCount: number;
  /**
   * Kết quả so khớp.
   * tiers rỗng nếu không trúng giải nào.
   * Basic: 1 triplet có thể trúng nhiều hạng (gộp giải theo luật Vietlott).
   * Plus: gộp tất cả giải đạt điều kiện.
   * Combo: mỗi hoán vị có thể trúng nhiều hạng.
   */
  matchResult: {
    tiers: Array<{ tier: string; winAmount: number }>;
    /** Tổng tiền thưởng = Σ(tiers[].winAmount). 0 nếu không trúng. */
    winAmount: number;
  };
}

export interface PlayerGetEntryLinesOutput {
  /** ID entry. */
  entryId: string;
  /** ID kỳ quay. */
  drawId: string;
  /** Danh sách lines trong trang hiện tại. */
  lines: PlayerLineInfo[];
  /** Cursor cho trang tiếp theo. Null nếu hết dữ liệu. */
  nextCursor: number | null;
  /** Số lines mỗi trang. */
  size: number;
}

// ─── Draw Results (Player) ───

/** Kết quả chi tiết 1 kỳ quay đã settle — dùng cho GetDrawResult API. */
export interface PlayerDrawResultInfo {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  /** Kết quả quay thưởng. */
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
  /** Bảng giải thưởng Max 3D Cơ Bản (4 hạng: special, first, second, third). */
  basicPrizes: DrawSettleSummaryTier[];
  /** Bảng giải thưởng Max 3D+ (7 hạng: special, first, second, third, fourth, fifth, sixth). */
  plusPrizes: DrawSettleSummaryTier[];
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
