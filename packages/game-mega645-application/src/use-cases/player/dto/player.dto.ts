/**
 * Mega 6/45 – Player DTOs
 *
 * Dữ liệu trả cho player qua API Gateway.
 * Mega 6/45 không có số đặc biệt — chỉ mainNumbers.
 */

import { EntryOutcome } from "@megawin/game-core/entities";

import { PrizeTier } from "@megawin/game-mega645/entities/enums";
// ─── Get Current Draw (Player) ───

export interface PlayerGetCurrentDrawOutput {
  /** Kỳ quay hiện tại (null nếu không có kỳ nào active). */
  currentDraw: PlayerDrawInfo | null;
  /** Tất cả các kỳ đang active, sắp xếp theo drawDate tăng dần. */
  activeDraws: PlayerDrawInfo[];
}

export interface PlayerDrawInfo {
  /** ID duy nhất của kỳ quay. */
  drawId: string;
  /** Ngày quay thưởng (ISO date). */
  drawDate: string;
  /** Số thứ tự kỳ quay. */
  drawNo: number;
  /** Giờ quay thưởng, ví dụ "18:00". */
  drawTime: string;
  /** Trạng thái kỳ quay (salesOpen, salesClosed, ...). */
  status: string;
  /** Thời gian mở/đóng bán vé. */
  sales: {
    /** Thời điểm mở bán (ISO datetime, undefined nếu chưa mở). */
    openAt?: string;
    /** Thời điểm đóng bán (ISO datetime). */
    closeAt: string;
  };
}

// ─── Get Jackpot (Player) ───

/**
 * Thông tin Jackpot Mega 6/45 trả cho player.
 *
 * Mega 6/45 KHÔNG có Split Cycle — Jackpot tích luỹ vô hạn cho đến khi có người trúng 6/6.
 * Không có splitThreshold, không có progress percentage.
 */
export interface PlayerGetJackpotOutput {
  /** Số thứ tự cycle (tự tăng). */
  cycleNo: number;
  /** Số tiền Jackpot hiện tại (VND). */
  currentAmount: number;
  /** Số tiền khởi điểm Jackpot (VND) — seed khi bắt đầu cycle mới. */
  seedAmount: number;
  /** Số tiền Jackpot cao nhất đạt được trong cycle hiện tại (VND). */
  peakAmount: number;
  /** Tổng tiền đã tích lũy từ đầu cycle (VND). */
  totalContribution: number;
  /** Số kỳ đã settled trong cycle hiện tại. */
  drawCount: number;
  /** Mã kỳ quay bắt đầu cycle. */
  startDrawId: string;
}

// ─── List Tickets (Player) ───

export interface PlayerListTicketsInput {
  /** ID tenant của người chơi. */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** Số lượng vé tối đa mỗi trang. */
  size: number;
  /** Ngày bắt đầu lọc (ISO date, inclusive). */
  from?: string;
  /** Ngày kết thúc lọc (ISO date, inclusive). */
  to?: string;
  /** Cursor cho phân trang (opaque string từ response trước). */
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
  /** ID tenant của người chơi. */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** Số lượng vé tối đa mỗi trang. */
  size: number;
  /** Cursor cho phân trang (opaque string từ response trước). */
  cursor?: string;
}

export interface PlayerTicketSummary {
  /** MongoDB document ID. */
  id: string;
  /** Mã vé hiển thị cho người chơi (human-readable). */
  ticketNo: string;
  /** Trạng thái vé (active, completed, voided). */
  status: string;
  /** Thông tin các kỳ quay đã đăng ký. */
  drawPlan: {
    /** Danh sách ID các kỳ quay đã đăng ký. */
    drawIds: string[];
    /** Tổng số kỳ quay tham gia. */
    drawCount: number;
  };
  /**
   * Chi tiết giá vé.
   *
   * Công thức: totalAmount = unitPrice × linesPerDraw × drawCount.
   */
  pricing: {
    /** Đơn giá 1 dòng (VND). */
    unitPrice: number;
    /** Tổng số dòng mỗi kỳ = ΣC(n,6) cho tất cả board. */
    linesPerDraw: number;
    /** Số tiền mỗi kỳ = unitPrice × linesPerDraw (VND). */
    amountPerDraw: number;
    /** Tổng tiền vé = amountPerDraw × drawCount (VND). */
    totalAmount: number;
  };
  /** Danh sách board chọn số trong vé. */
  boards: Array<{
    /** Mã board (A, B, C...). */
    boardNo: string;
    /** Loại cách chơi (normal / system). */
    playType: string;
    /** Các số đã chọn. */
    selection: {
      /** Danh sách số chính đã chọn ("01"-"45"). */
      mainNumbers: string[];
    };
    /** Số dòng expand ra từ board này = C(n,6) với n = số lượng mainNumbers. */
    expandedLines: number;
  }>;
  /** Tiến trình xử lý vé qua các kỳ quay. settledDraws = số kỳ đã xử lý xong (settled + voided). */
  progress: {
    /** Tổng số kỳ quay đã đăng ký. */
    totalDraws: number;
    /** Số kỳ đã xử lý xong (settled + voided). */
    settledDraws: number;
  };
  /** Tổng hợp kết quả trúng thưởng (chỉ có sau khi settle ít nhất 1 kỳ). */
  settlement?: {
    /** Tổng tiền thắng từ tất cả các kỳ đã settle (VND). */
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
  /** Thời điểm tạo vé (ISO datetime). */
  createdAt: string;
}

export interface PlayerListTicketsOutput {
  /** Danh sách vé. */
  tickets: PlayerTicketSummary[];
  /** Cursor cho trang tiếp theo (null nếu hết dữ liệu). */
  nextCursor: string | null;
  /** Số bản ghi trả về. */
  size: number;
}

// ─── Get Ticket Entries (Player) ───

export interface PlayerGetTicketEntriesInput {
  /** ID tenant của người chơi. */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** ID vé cần xem entries. */
  ticketId: string;
}

export interface PlayerEntryInfo {
  /** MongoDB document ID. */
  id: string;
  /** ID kỳ quay entry thuộc về. */
  drawId: string;
  /** Trạng thái entry (drawn, settled, voided...). */
  status: string;
  /** Số tiền entry = unitPrice × tổng dòng (VND). */
  amount: number;
  /** Tổng số dòng trong entry. */
  lineCount: number;
  /** Tóm tắt entry (dùng cho hiển thị). */
  entrySummary: {
    /** Mã vé chứa entry này. */
    ticketNo: string;
    /** Danh sách board trong entry. */
    boards: Array<{
      /** Mã board (A, B, C...). */
      boardNo: string;
      /** Loại cách chơi (normal / system). */
      playType: string;
      /** Danh sách số chính đã chọn ("01"-"45"). */
      mainNumbers: string[];
      /** Số dòng expand ra = C(n,6). */
      expandedLines: number;
    }>;
  };
  /** Kết quả quay thưởng (chỉ có khi kỳ đã công bố). */
  result?: {
    /** 6 số chính trúng thưởng ("01"-"45"). */
    winningMain: string[];
    /** Thời điểm công bố kết quả (ISO datetime). */
    publishedAt: string;
  };
  /** Kết quả tổng hợp của entry: "win" | "loss" (chỉ có sau settle). */
  outcome?: EntryOutcome;
  /** Chi tiết trả thưởng (chỉ có nếu outcome = "win"). */
  payout?: {
    /** Tổng tiền thắng (VND) — chưa trừ thuế. */
    winAmount: number;
    /** Số tiền thực trả cho người chơi (VND). */
    payoutAmount: number;
    /** Chi tiết từng hạng giải đã trúng. */
    tiers: Array<{
      /** Hạng giải: "jackpot" (6/6), "tier1" (5/6), "tier2" (4/6), "tier3" (3/6). */
      tier: PrizeTier;
      /** Số dòng trúng hạng này. */
      hitCount: number;
      /** Tiền thưởng mỗi dòng (VND). */
      unitAmount: number;
      /** Tổng tiền thưởng hạng này = unitAmount × hitCount (VND). */
      amount: number;
    }>;
  };
}

export interface PlayerGetTicketEntriesOutput {
  /** Thông tin tóm tắt vé. */
  ticket: PlayerTicketSummary;
  /** Danh sách entries (mỗi kỳ quay = 1 entry). */
  entries: PlayerEntryInfo[];
}

// ─── Get Entry Lines (Player) ───

export interface PlayerGetEntryLinesInput {
  /** ID tenant của người chơi. */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** ID entry cần xem chi tiết dòng. */
  entryId: string;
  /** Số dòng mỗi trang. */
  size: number;
  /** lineIndex của phần tử cuối cùng trang trước (cursor). */
  cursor?: number;
}

export interface PlayerLineInfo {
  /** Mã board chứa dòng này (A, B, C...). */
  boardNo: string;
  /** Chỉ số dòng trong board (0-based). */
  lineIndex: number;
  /** 6 số chính của dòng ("01"-"45"), đã sort ascending. */
  main: string[];
  /** Kết quả so khớp dòng với kết quả quay. */
  matchResult: {
    /** Số lượng số chính khớp (0-6). */
    mainMatchCount: number;
    /** Hạng giải: "jackpot" (6/6), "tier2" (5/6), "tier3" (4/6), "tier4" (3/6), null nếu không trúng. */
    tier: string | null;
    /** Tiền thưởng dòng này (VND). Jackpot = 0 tại đây, tính riêng qua split. */
    winAmount: number;
  };
}

export interface PlayerGetEntryLinesOutput {
  /** ID entry đang xem. */
  entryId: string;
  /** ID kỳ quay entry thuộc về. */
  drawId: string;
  /** Danh sách dòng trong trang hiện tại. */
  lines: PlayerLineInfo[];
  /** Cursor cho trang tiếp theo. Null nếu hết dữ liệu. */
  nextCursor: number | null;
  /** Số dòng mỗi trang. */
  size: number;
}

// ─── Draw Results (Player) ───

export interface PlayerListDrawResultsInput {
  /**
   * Lọc từ ngày (YYYY-MM-DD, inclusive).
   * Handler luôn truyền (default = ngày hôm nay giờ VN).
   */
  from: string;
  /** Số lượng kết quả mỗi trang. */
  size: number;
  /** Cursor phân trang (drawId cuối trang trước). */
  cursor?: string;
}

/**
 * Chi tiết giải thưởng 1 tier trong kết quả kỳ quay Mega 6/45.
 * Dùng bởi GetDrawResultPlayerUseCase (detail endpoint).
 */
export interface PlayerDrawTierPrize {
  /**
   * Hạng giải: "jackpot" (6/6), "tier1" (5/6), "tier2" (4/6), "tier3" (3/6).
   * Giá trị từ PrizeTier enum.
   */
  tier: string;
  /**
   * Số lượt trúng tier này (tổng hit count từ tất cả entries).
   * Không phải số người chơi — 1 người chơi bao có thể trúng nhiều lần.
   */
  winnerCount: number;
  /**
   * Tổng tiền thưởng tier này (VND).
   * Jackpot: = openingAmount + jackpotContribution kỳ này (FinalizeSettle patch).
   * Non-jackpot: tổng tiền cố định aggregate từ entries.
   */
  prizeAmount: number;
}

/**
 * Chi tiết kết quả 1 kỳ quay Mega 6/45 — dùng cho trang xem kết quả.
 *
 * Bao gồm: kết quả 6 số, jackpot snapshot, bảng giải thưởng chi tiết.
 * Chỉ trả cho draws đã settle có kết quả.
 *
 * Dùng bởi endpoint: GET /games/mega645/draw-results/:drawId
 */
export interface PlayerDrawResultInfo {
  /** Mã kỳ quay (VD: "2026-03-08.001"). */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày (luôn = 1 cho Mega 6/45). */
  drawNo: number;
  /** Giờ quay (ISO 8601). */
  drawTime: string;
  /**
   * Kết quả kỳ quay.
   * Mega 6/45: chỉ 6 số chính, KHÔNG có số đặc biệt.
   */
  result: {
    /** 6 số chính trúng thưởng (sorted, zero-padded "01"-"45"). */
    winningMain: string[];
    /** Thời điểm công bố (ISO 8601). */
    publishedAt: string;
  };
  /**
   * Snapshot Jackpot tại kỳ quay này.
   * openingAmount = Jackpot trước kỳ. closingAmount = Jackpot sau kỳ.
   */
  jackpot: {
    /** Jackpot đầu kỳ (VND). */
    openingAmount: number;
    /** Jackpot cuối kỳ (VND). Luôn = openingAmount + contribution. */
    closingAmount: number;
  };
  /**
   * Bảng giải thưởng chi tiết từng hạng.
   * Tất cả 4 tiers luôn có mặt (kể cả winnerCount = 0).
   */
  prizes: PlayerDrawTierPrize[];
  /** Tham chiếu Vietlott (nếu có). */
  vietlottRef?: {
    /** Mã kỳ Vietlott chính thức. */
    drawPeriod: string;
    /** Ngày quay Vietlott (YYYY-MM-DD). */
    drawDate: string;
  };
}

/**
 * Tóm tắt 1 kỳ quay Mega 6/45 trong danh sách.
 *
 * Chỉ chứa kết quả 6 số + jackpot snapshot.
 * Không có bảng giải thưởng chi tiết (xem ở detail endpoint).
 *
 * Dùng bởi endpoint: GET /games/mega645/draw-results
 */
export interface PlayerDrawResultSummary {
  /** Mã kỳ quay (VD: "2026-03-08.001"). */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày. */
  drawNo: number;
  /** Giờ quay (ISO 8601). */
  drawTime: string;
  /**
   * Kết quả kỳ quay.
   * Mega 6/45: chỉ 6 số chính, KHÔNG có số đặc biệt.
   */
  result: {
    /** 6 số chính trúng thưởng (sorted, zero-padded "01"-"45"). */
    winningMain: string[];
    /** Thời điểm công bố (ISO 8601). */
    publishedAt: string;
  };
  /** Jackpot snapshot kỳ quay — hữu ích để hiển thị kỳ có trúng Jackpot không. */
  jackpot: {
    /** Jackpot đầu kỳ (VND). */
    openingAmount: number;
    /** Jackpot cuối kỳ (VND). */
    closingAmount: number;
  };
  /** Tham chiếu Vietlott (nếu có). */
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

export interface PlayerListDrawResultsOutput {
  /** Danh sách tóm tắt kỳ quay (kết quả + jackpot). */
  draws: PlayerDrawResultSummary[];
  /** Cursor cho trang tiếp theo (drawId). Null nếu hết dữ liệu. */
  nextCursor: string | null;
  /** Số lượng mỗi trang. */
  size: number;
}
