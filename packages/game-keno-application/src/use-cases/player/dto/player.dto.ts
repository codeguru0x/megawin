/**
 * Keno – Player DTOs
 *
 * Dữ liệu trả cho player qua API Gateway.
 * Chỉ chứa thông tin player cần — loại bỏ dữ liệu vận hành/công ty.
 */

import type { DrawPrizeSummary } from "@megawin/game-keno/entities";
import { EntryOutcome } from "@megawin/game-core/entities";

export type { DrawPrizeSummary as PlayerPrizeSummary };

// ─── Get Current Draw (Player) ───

export interface PlayerGetCurrentDrawOutput {
  currentDraw: PlayerDrawInfo | null;
  activeDraws: PlayerDrawInfo[];
}

export interface PlayerDrawInfo {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  status: string;
  sales: {
    openAt?: string;
    closeAt: string;
  };
}

// ─── List Tickets (Player) ───

/**
 * Cursor-based pagination cho danh sách vé.
 *
 * Tại sao cursor thay vì page/offset?
 * - Collection kenoTickets có thể hàng triệu docs.
 * - skip(page*size) phải scan qua tất cả docs bỏ qua → O(skip+limit), chậm ở page lớn.
 * - Cursor dùng range query trên indexed field (_id hoặc createdAt) → O(limit) luôn.
 */

export interface PlayerListTicketsInput {
  tenantId: string;
  accountId: string;
  size: number;
  from?: string;
  to?: string;
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
  tenantId: string;
  accountId: string;
  size: number;
  cursor?: string;
}

export interface PlayerTicketSummary {
  id: string;
  ticketNo: string;
  status: string;
  drawPlan: {
    drawIds: string[];
    drawCount: number;
  };
  pricing: {
    unitPrice: number;
    selectionsPerDraw: number;
    betUnitsPerDraw: number;
    amountPerDraw: number;
    totalAmount: number;
  };
  boards: Array<{
    boardNo: string;
    playType: string;
    /** Số đã chọn. Chỉ cho cơ bản (pick1-pick10). */
    numbers?: string[];
    /** Lựa chọn side bet. Chỉ cho bổ sung (bigSmall/evenOdd). */
    bet?: string;
    betCount: number;
  }>;
  /**
   * Tiến trình xử lý — settledDraws = số kỳ đã hoàn tất (settled + voided).
   * Để biết cụ thể bao nhiêu kỳ voided, xem voidSummary.voidedDrawCount.
   */
  progress: {
    totalDraws: number;
    settledDraws: number;
  };
  /** Tổng kết thắng cược. Undefined nếu chưa có kỳ nào settle. */
  settlement?: {
    totalWinAmount: number;
    lastSettledAt?: string;
  };
  /**
   * Tóm tắt huỷ cược. Có khi ít nhất 1 kỳ bị void.
   * Multi-draw: hoàn tiền một phần.
   * Single-draw: hoàn toàn bộ, status = "refunded".
   */
  voidSummary?: {
    totalVoidedAmount: number;
    totalRefundedAmount: number;
    voidedDrawCount: number;
    voidedDrawIds: string[];
    lastVoidedAt?: string;
  };
  createdAt: string;
}

export interface PlayerListTicketsOutput {
  tickets: PlayerTicketSummary[];
  nextCursor: string | null;
  size: number;
}

// ─── Get Ticket Entries (Player) ───

export interface PlayerGetTicketEntriesInput {
  tenantId: string;
  accountId: string;
  ticketId: string;
}

export interface PlayerEntryInfo {
  id: string;
  drawId: string;
  status: string;
  /** Tổng tiền đặt cược của entry (VND) = betUnitCount × unitPrice. */
  amount: number;
  /** Mệnh giá 1 lần tham gia dự thưởng (VND). Thường là 10.000đ. */
  unitPrice: number;
  selectionCount: number;
  betUnitCount: number;
  entrySummary: {
    ticketNo: string;
    boards: Array<{
      boardNo: string;
      playType: string;
      /** Số đã chọn. Chỉ cho cơ bản (pick1-pick10). */
      numbers?: string[];
      /** Lựa chọn side bet. Chỉ cho bổ sung (bigSmall/evenOdd). */
      bet?: string;
      betCount: number;
    }>;
  };
  result?: {
    winningNumbers: string[];
    publishedAt: string;
    bigCount: number;
    smallCount: number;
    evenCount: number;
    oddCount: number;
  };
  outcome?: EntryOutcome;
  payout?: {
    winAmount: number;
    payoutAmount: number;
    boardPayouts: Array<{
      boardNo: string;
      playType: string;
      /** Số trùng với kết quả quay. null cho bổ sung (bigSmall/evenOdd) — field không áp dụng. */
      matchCount: number | null;
      /** Số lượng số đã chọn. null cho bổ sung — field không áp dụng. */
      pickCount: number | null;
      /** Lựa chọn side bet. Chỉ cho bổ sung (bigSmall/evenOdd). */
      bet?: string;
      /** Outcome thực tế. Chỉ cho bổ sung. */
      outcome?: string;
      /** Player thắng hay không. Set cho tất cả play types. */
      isWin: boolean;
      winAmount: number;
    }>;
  };
}

export interface PlayerGetTicketEntriesOutput {
  /** Danh sách entries của vé. */
  entries: PlayerEntryInfo[];
}

// ─── Draw Result (Player) ───

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

/**
 * Tóm tắt 1 kỳ quay Keno trong danh sách — chỉ trả kết quả draw, không có bảng giải thưởng.
 * Dùng bởi GET /games/keno/draw-results (list).
 * Prize details xem ở GET /games/keno/draw-results/:drawId (detail).
 */
export interface PlayerDrawResultSummary {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  result: {
    winningNumbers: string[];
    publishedAt: string;
    bigCount: number;
    smallCount: number;
    evenCount: number;
    oddCount: number;
  };
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

/**
 * Chi tiết đầy đủ 1 kỳ quay Keno — bao gồm bảng giải thưởng.
 * Dùng bởi GET /games/keno/draw-results/:drawId (detail).
 */
export interface PlayerDrawResultInfo {
  drawId: string;
  drawDate: string;
  drawNo: number;
  drawTime: string;
  result: {
    winningNumbers: string[];
    publishedAt: string;
    bigCount: number;
    smallCount: number;
    evenCount: number;
    oddCount: number;
  };
  /** Bảng giải thưởng — cả cơ bản (pick1-pick10) và bổ sung (bigSmall/evenOdd). */
  prizes: DrawPrizeSummary[];
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

// ─────────────────────────────────────────────
// Combo Popularity (minh bạch combo cappable — p1-01)
// ─────────────────────────────────────────────

/**
 * Input tra cứu độ đông 1 bộ số cappable (pick8/9/10) của CHÍNH player.
 *
 * `accountId` lấy từ auth (không nhận từ client). Ownership-gate: chỉ trả dữ liệu khi
 * account thực sự có entry chứa đúng combo này trong kỳ — combo lạ luôn báo không tồn tại.
 */
export interface PlayerComboPopularityInput {
  /** Account đang yêu cầu — lấy từ JWT, KHÔNG nhận từ body/query. */
  accountId: string;
  /** drawId dạng `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Số "01".."80" của combo cần check — 8, 9 hoặc 10 số distinct. */
  numbers: string[];
}

/**
 * Kết quả minh bạch combo cho player.
 *
 * `found=false` (đồng nhất cho cả "player chưa cược combo này" lẫn "combo chưa ai chơi") —
 * cố ý KHÔNG phân biệt để chặn dò ẩn bộ số hệ thống. `sets` chỉ có khi `found=true`.
 * TUYỆT ĐỐI không trả amount/accountId/username cho player.
 *
 * CHỈ trả `sets` (không trả số người chơi): quy tắc chia đều cap 8/9/10 (analysis
 * `keno-game-rules`) dùng tổng SỐ BỘ trúng làm mẫu số (`maxPerDraw / winnerCount`,
 * winnerCount đếm theo board trúng, không theo account) — `sets` là dữ liệu tối giản
 * và đúng nhất để player tự kiểm chứng phần chia của mình.
 */
export interface PlayerComboPopularityOutput {
  /** true CHỈ khi account có entry chứa đúng combo này VÀ combo có dữ liệu. */
  found: boolean;
  /** Tổng số bộ mọi người cược combo này (Σ betCount). Chỉ có khi `found=true`. */
  sets?: number;
}
