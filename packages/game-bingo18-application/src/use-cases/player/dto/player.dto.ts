/**
 * Bingo 18 – Player DTOs
 *
 * Dữ liệu trả cho player qua API Gateway.
 * Chỉ chứa thông tin player cần — loại bỏ dữ liệu vận hành/công ty.
 */

import type {
  DrawBasicPrizeSummary,
  DrawSideBetPrizeSummary,
  EntryResult,
  EntryBoardPayout,
  EntrySideBetPayout,
} from "@megawin/game-bingo18/entities";
import { EntryOutcome } from "@megawin/game-core/entities";

export type {
  DrawBasicPrizeSummary as PlayerBasicPrize,
  DrawSideBetPrizeSummary as PlayerSideBetPrize,
};

// ─── Get Current Draw (Player) ───

export interface PlayerGetCurrentDrawOutput {
  /** Kỳ quay hiện tại (null nếu không có kỳ nào mở bán). */
  currentDraw: PlayerDrawInfo | null;
  /** Danh sách kỳ quay đang hoạt động. */
  activeDraws: PlayerDrawInfo[];
}

export interface PlayerDrawInfo {
  /** ID kỳ quay. */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày. */
  drawNo: number;
  /** Thời điểm quay (ISO 8601). */
  drawTime: string;
  /** Trạng thái kỳ quay (salesOpen, salesClosed, …). */
  status: string;
  /** Thông tin mở/đóng bán. */
  sales: {
    /** Thời điểm mở bán (ISO 8601). */
    openAt?: string;
    /** Thời điểm đóng bán (ISO 8601). */
    closeAt: string;
  };
}

// ─── List Tickets (Player) ───

export interface PlayerListTicketsInput {
  /** ID tenant của player. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** Số lượng vé mỗi trang. */
  size: number;
  /** Lọc từ ngày (YYYY-MM-DD, inclusive). */
  from?: string;
  /** Lọc đến ngày (YYYY-MM-DD, inclusive). */
  to?: string;
  /** Cursor để phân trang (opaque string từ response trước). */
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
  /** ID tenant của player. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** Số lượng vé mỗi trang. */
  size: number;
  /** Cursor để phân trang (opaque string từ response trước). */
  cursor?: string;
}

export interface PlayerTicketSummary {
  /** MongoDB document ID. */
  id: string;
  /** Mã vé hiển thị cho player. */
  ticketNo: string;
  /** Trạng thái vé (pending, completed, void, …). */
  status: string;
  /** Kế hoạch kỳ quay đã đăng ký. */
  drawPlan: {
    /** Danh sách drawId đã đăng ký. */
    drawIds: string[];
    /** Tổng số kỳ quay = drawIds.length. */
    drawCount: number;
  };
  /** Thông tin giá vé. */
  pricing: {
    /** Đơn giá 1 lần tham gia dự thưởng (VND). */
    unitPrice: number;
    /** Số selections mỗi kỳ = boards.length + sideBets.length. */
    selectionsPerDraw: number;
    /** Tổng đơn vị cược mỗi kỳ = Σ(board.betCount) + Σ(sideBet.betCount). */
    betUnitsPerDraw: number;
    /** Tiền mỗi kỳ = betUnitsPerDraw × unitPrice. */
    amountPerDraw: number;
    /** Tổng tiền vé = amountPerDraw × drawCount. */
    totalAmount: number;
  };
  /** Danh sách bảng chơi chính (SingleNum, DoubleMatch, TripleMatch). */
  boards: Array<{
    /** Số thứ tự bảng (A, B, C, …). */
    boardNo: string;
    /** Loại chơi (singleNum, doubleMatch, tripleMatch). */
    playType: string;
    /** Số đã chọn (1-6). Áp dụng cho singleNum, doubleMatch. */
    number?: number;
    /** Loại bộ ba (specific | any). Áp dụng cho tripleMatch. */
    tripleKind?: string;
    /** Số lần tham gia dự thưởng cho board này. Tiền = betCount × unitPrice. */
    betCount: number;
  }>;
  /** Danh sách cược phụ (SumTotal, BigSmallDraw). */
  sideBets: Array<{
    /** Loại cược phụ (sumTotal, bigSmallDraw). */
    playType: string;
    /** Tổng dự đoán (3-18). Áp dụng cho sumTotal. */
    sum?: number;
    /** Lựa chọn Tài/Xỉu/Hoà (big | small | draw). Áp dụng cho bigSmallDraw. */
    bet?: string;
    /** Số lần tham gia dự thưởng cho side bet này. Tiền = betCount × unitPrice. */
    betCount: number;
  }>;
  /**
   * Tiến độ settle. settledDraws = số kỳ đã xử lý xong (settled + voided).
   * Để biết cụ thể bao nhiêu kỳ voided, xem voidSummary.voidedDrawCount.
   */
  progress: {
    /** Tổng số kỳ đã đăng ký. */
    totalDraws: number;
    /** Số kỳ đã xử lý xong (settled + voided). */
    settledDraws: number;
  };
  /** Tổng kết trả thưởng. Undefined nếu chưa có kỳ nào settle. */
  settlement?: {
    /** Tổng tiền thắng cộng dồn (VND) = Σ(entry.winAmount) qua tất cả kỳ settle. */
    totalWinAmount: number;
    /** Thời điểm kỳ gần nhất được settle (ISO 8601). */
    lastSettledAt?: string;
  };
  /**
   * Tóm tắt huỷ cược. Có khi ít nhất 1 kỳ bị void.
   * Multi-draw: hoàn tiền một phần. Single-draw: hoàn toàn bộ → status = "refunded".
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
  /** Cursor cho trang tiếp theo (null nếu hết). */
  nextCursor: string | null;
  /** Kích thước trang đã yêu cầu. */
  size: number;
}

// ─── Get Ticket Entries (Player) ───

export interface PlayerGetTicketEntriesInput {
  /** ID tenant của player. */
  tenantId: string;
  /** ID tài khoản player. */
  accountId: string;
  /** ID vé cần xem chi tiết entries. */
  ticketId: string;
}

export interface PlayerEntryInfo {
  /** MongoDB document ID của entry. */
  id: string;
  /** ID kỳ quay mà entry tham gia. */
  drawId: string;
  /** Trạng thái entry (scheduled, settled, void). */
  status: string;
  /** Tổng tiền đặt cược của entry (VND) = betUnitCount × unitPrice. */
  amount: number;
  /** Mệnh giá 1 lần tham gia dự thưởng (VND). Thường là 10.000đ. */
  unitPrice: number;
  /** Số lượng cược (selections) = boards.length + sideBets.length. Không tính multiplier. */
  selectionCount: number;
  /** Tổng đơn vị cược = Σ(board.betCount) + Σ(sideBet.betCount). amount = betUnitCount × unitPrice. */
  betUnitCount: number;
  /** Tóm tắt nội dung đặt cược. */
  entrySummary: {
    /** Mã vé hiển thị. */
    ticketNo: string;
    /** Danh sách bảng chơi chính. */
    boards: Array<{
      /** Số thứ tự bảng (A, B, C, …). */
      boardNo: string;
      /** Loại chơi (singleNum, doubleMatch, tripleMatch). */
      playType: string;
      /** Số đã chọn (1-6). */
      number?: number;
      /** Loại bộ ba (specific | any). */
      tripleKind?: string;
      /** Số lần tham gia dự thưởng của board này. Tiền = betCount × unitPrice. */
      betCount: number;
    }>;
    /** Danh sách cược phụ. */
    sideBets: Array<{
      /** Loại cược phụ (sumTotal, bigSmallDraw). */
      playType: string;
      /** Tổng dự đoán (3-18). */
      sum?: number;
      /** Lựa chọn Tài/Xỉu/Hoà (big | small | draw). */
      bet?: string;
      /** Số lần tham gia dự thưởng của side bet này. Tiền = betCount × unitPrice. */
      betCount: number;
    }>;
  };
  /**
   * Kết quả quay (chỉ có sau khi publish).
   * publishedAt là ISO 8601 string (khác EntryResult.publishedAt kiểu Date).
   */
  result?: Omit<EntryResult, "publishedAt"> & { publishedAt: string };
  /** Kết quả thắng/thua (win | loss). Chỉ có sau settle. */
  outcome?: EntryOutcome;
  /** Chi tiết trả thưởng (chỉ có sau settle). */
  payout?: {
    /** Tổng tiền thắng (VND) = Σ(boardPayouts.winAmount) + Σ(sideBetPayouts.winAmount). */
    winAmount: number;
    /** Số tiền thực trả = winAmount (Bingo18 không có cap). */
    payoutAmount: number;
    /**
     * Chi tiết trả thưởng từng bảng chơi chính.
     * Subset của EntryBoardPayout — bỏ betCount, unitWinAmount, tripleKind (dữ liệu vận hành).
     */
    boardPayouts: Array<
      Pick<EntryBoardPayout, "boardNo" | "playType" | "matchCount" | "winAmount">
    >;
    /**
     * Chi tiết trả thưởng từng cược phụ.
     * Subset của EntrySideBetPayout — bỏ betCount, unitWinAmount (dữ liệu vận hành).
     */
    sideBetPayouts: Array<
      Pick<EntrySideBetPayout, "playType" | "sum" | "bet" | "outcome" | "isWin" | "winAmount">
    >;
  };
}

export interface PlayerGetTicketEntriesOutput {
  /** Danh sách entries thuộc vé, mỗi entry ứng với 1 kỳ quay. */
  entries: PlayerEntryInfo[];
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
    /** 3 số kết quả (giữ nguyên thứ tự quay). */
    numbers: number[];
    /** Tổng 3 số (3-18). */
    sum: number;
    /** Thời điểm công bố kết quả (ISO 8601). */
    publishedAt: string;
  };
  /**
   * Bảng giải thưởng cơ bản — chỉ chứa loại chơi có người trúng.
   * Grouped theo (playType, matchCount).
   */
  basicPrizes: DrawBasicPrizeSummary[];
  /**
   * Bảng giải thưởng side bet — chỉ chứa (playType, bet) có người trúng.
   */
  sideBetPrizes: DrawSideBetPrizeSummary[];
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

/**
 * Tóm tắt 1 kỳ quay trong danh sách — không có bảng giải chi tiết.
 * Dùng bởi GET /games/bingo18/draw-results (list).
 * Bảng giải chi tiết xem tại GET /games/bingo18/draw-results/:drawId.
 */
export interface PlayerDrawResultSummary {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  result: {
    numbers: number[];
    sum: number;
    publishedAt: string;
  };
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

export interface PlayerListDrawResultsInput {
  /** Lọc từ ngày (YYYY-MM-DD, inclusive). Handler luôn truyền (default = today VN). */
  from: string;
  size: number;
  cursor?: string;
}

export interface PlayerListDrawResultsOutput {
  draws: PlayerDrawResultSummary[];
  nextCursor: string | null;
  size: number;
}
