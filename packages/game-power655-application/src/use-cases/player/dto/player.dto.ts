/**
 * Power 6/55 – Player DTOs
 *
 * Dữ liệu trả cho player qua API Gateway.
 * Chỉ chứa thông tin player cần — loại bỏ dữ liệu vận hành/công ty.
 *
 * Khác biệt so với Lotto 5/35:
 *   - Dual jackpot: jackpot1CurrentAmount + jackpot2CurrentAmount
 *   - Lines không có special number
 *   - matchResult có bonusMatched thay vì specialMatched
 */

import { EntryOutcome } from "@megawin/game-core/entities";
import { PrizeTier } from "@megawin/game-power655/entities/enums";

// ─── Get Current Draw (Player) ───

export interface PlayerGetCurrentDrawOutput {
  /** Kỳ quay active đầu tiên (null nếu không có kỳ nào đang active). */
  currentDraw: PlayerDrawInfo | null;
  /** Tất cả các kỳ quay đang active, sorted theo drawDate tăng dần. */
  activeDraws: PlayerDrawInfo[];
}

export interface PlayerDrawInfo {
  /** ID kỳ quay. */
  drawId: string;
  /** Ngày quay, định dạng YYYY-MM-DD. */
  drawDate: string;
  /** Số thứ tự kỳ quay. */
  drawNo: number;
  /** Giờ quay, định dạng HH:mm (giờ VN). */
  drawTime: string;
  /** Trạng thái kỳ quay (scheduled / salesOpen / salesClosed / ...). */
  status: string;
  /** Thông tin thời gian mở/đóng bán vé. */
  sales: {
    /** Thời điểm mở bán (ISO 8601). Undefined nếu chưa mở. */
    openAt?: string;
    /** Thời điểm đóng bán (ISO 8601). */
    closeAt: string;
  };
}

// ─── Get Jackpot (Player) ───

export interface PlayerGetJackpotOutput {
  /** Số thứ tự cycle (tăng dần khi cycle mới). Hiển thị "Chu kỳ #N". */
  cycleNo: number;

  /** Số tiền Jackpot 1 hiện tại (VND) — giải trùng 6/6 số chính. */
  jackpot1CurrentAmount: number;

  /** Số tiền Jackpot 2 hiện tại (VND) — giải trùng 5/6 + bonus. */
  jackpot2CurrentAmount: number;

  /** Giá trị khởi tạo Jackpot 1 khi bắt đầu cycle mới (VND). */
  jackpot1SeedAmount: number;

  /** Giá trị khởi tạo Jackpot 2 khi bắt đầu cycle mới (VND). */
  jackpot2SeedAmount: number;
  /**
   * Ngưỡng tràn Jackpot 1 (VND).
   * Khi Jackpot 1 vượt ngưỡng và có Jackpot 2 winner, phần vượt chuyển sang Jackpot 2.
   * Giúp player hiểu cơ chế overflow — "Jackpot 1 gần ngưỡng 300 tỷ!".
   */
  jackpot1OverflowThreshold: number;

  /** Số kỳ quay đã settle trong cycle này — player biết JP tích lũy bao lâu. */
  drawCount: number;

  /**
   * Số lần JP2 đã trúng và reset trong cycle hiện tại.
   * 0 = JP2 chưa ai trúng từ đầu cycle. Thú vị cho player theo dõi.
   */
  jackpot2ResetCount: number;

  /** Thời điểm bắt đầu cycle (ISO 8601). */
  startedAt: string;

  /** ID kỳ quay đầu tiên của cycle. */
  startDrawId: string;
}

// ─── List Tickets (Player) ───

export interface PlayerListTicketsInput {
  /** ID tenant (đại lý) của người chơi. */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** Số lượng vé mỗi trang. */
  size: number;
  /** Lọc từ ngày (YYYY-MM-DD, inclusive). */
  from?: string;
  /** Lọc đến ngày (YYYY-MM-DD, inclusive). */
  to?: string;
  /** Cursor phân trang (lấy từ nextCursor của response trước). */
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
  /** ID tenant (đại lý) của người chơi. */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** Số lượng vé mỗi trang. */
  size: number;
  /** Cursor phân trang (lấy từ nextCursor của response trước). */
  cursor?: string;
}

export interface PlayerTicketSummary {
  /** ID vé (MongoDB _id). */
  id: string;
  /** Mã vé hiển thị (ví dụ: "PW-20250301-00123"). */
  ticketNo: string;
  /** Trạng thái vé (active / completed / voided). */
  status: string;
  /** Kế hoạch kỳ quay của vé. */
  drawPlan: {
    /** Danh sách ID các kỳ quay mà vé tham gia. */
    drawIds: string[];
    /** Tổng số kỳ quay vé tham gia. */
    drawCount: number;
  };
  /** Thông tin giá cược. */
  pricing: {
    /** Giá 1 dòng cược (VND). */
    unitPrice: number;
    /** Số dòng cược mỗi kỳ quay. */
    linesPerDraw: number;
    /**
     * Số tiền cược mỗi kỳ quay (VND).
     * Công thức: unitPrice × linesPerDraw.
     */
    amountPerDraw: number;
    /**
     * Tổng tiền cược toàn vé (VND).
     * Công thức: amountPerDraw × drawCount.
     */
    totalAmount: number;
  };
  /** Danh sách boards trong vé. */
  boards: Array<{
    /** Mã board (A, B, C, ...). */
    boardNo: string;
    /** Loại chơi (Standard / Bao5 / Bao7-18 / QuickPick). */
    playType: string;
    /** Các số đã chọn trên board. */
    selection: {
      /** Danh sách số chính đã chọn (6-18 số, zero-padded "01"-"55"). */
      mainNumbers: string[];
    };
    /** Số dòng cược sinh ra từ board này. Standard=1, BaoN=C(N,6). */
    lineCount: number;
  }>;
  /** Tiến trình xử lý vé qua các kỳ quay. settledDraws = số kỳ đã xử lý xong (settled + voided). */
  progress: {
    /** Tổng số kỳ quay của vé. */
    totalDraws: number;
    /** Số kỳ đã xử lý xong (settled + voided). */
    settledDraws: number;
  };
  /** Tổng kết thưởng (chỉ có khi đã có ít nhất 1 kỳ settle). */
  settlement?: {
    /** Tổng tiền thắng từ tất cả entries đã settle (VND). */
    totalWinAmount: number;
    /** Thời điểm kỳ gần nhất được settle (ISO 8601). */
    lastSettledAt?: string;
  };
  /**
   * Tóm tắt huỷ cược. Có khi ít nhất 1 kỳ bị void.
   * Multi-draw: hoàn tiền một phần. Single-draw: hoàn toàn bộ → status = "refunded".
   */
  voidSummary?: {
    /** Tổng tiền đã hoàn trả cho player (VND). Σ(amountPerDraw) × số kỳ bị void. */
    totalRefundedAmount: number;
    /** Tổng tiền stake bị void (VND). Bằng totalRefundedAmount nếu không có partial board void. */
    totalVoidedAmount: number;
    /** Số kỳ đã bị huỷ. */
    voidedDrawCount: number;
    /** Danh sách drawId bị void. */
    voidedDrawIds: string[];
    /** Thời điểm void gần nhất (ISO 8601). */
    lastVoidedAt?: string;
  };
  /** Thời điểm tạo vé (ISO 8601). */
  createdAt: string;
}

export interface PlayerListTicketsOutput {
  /** Danh sách vé. */
  tickets: PlayerTicketSummary[];
  /** Cursor cho trang tiếp theo. Null nếu hết dữ liệu. */
  nextCursor: string | null;
  /** Số lượng mỗi trang. */
  size: number;
}

// ─── Get Ticket Entries (Player) ───

export interface PlayerGetTicketEntriesInput {
  /** ID tenant (đại lý) của người chơi. */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** ID vé cần xem chi tiết entries. */
  ticketId: string;
}

export interface PlayerEntryInfo {
  /** ID entry (MongoDB _id). */
  id: string;
  /** ID kỳ quay mà entry thuộc về. */
  drawId: string;
  /** Trạng thái entry (drawn / settled / voided). */
  status: string;
  /** Số tiền cược cho entry này (VND). */
  amount: number;
  /** Số dòng cược trong entry. */
  lineCount: number;
  /** Tóm tắt entry – snapshot từ ticket gốc, dùng cho UI mà không cần lookup ticket. */
  entrySummary: {
    /** Mã vé hiển thị cho khách. */
    ticketNo: string;
    /** Snapshot các board từ vé gốc. */
    boards: Array<{
      /** Ký hiệu board ("A".."E"). */
      boardNo: string;
      /** Kiểu chơi (standard / bao5 / bao7-18 / quickPick). */
      playType: string;
      /** Danh sách số chính người chơi đã chọn ("01"-"55"). */
      mainNumbers: string[];
      /** Số line sau khi expand từ board (1 với standard/quickPick, 50 với bao5, C(N,6) với bao7-18). */
      expandedLines: number;
    }>;
  };
  /** Kết quả quay (chỉ có khi kỳ đã công bố kết quả). */
  result?: {
    /** 6 số chính trúng thưởng (zero-padded "01"-"55"). */
    winningMain: string[];
    /** Số bonus (zero-padded "01"-"55"). */
    bonusNumber: string;
    /** Thời điểm công bố kết quả (ISO 8601). */
    publishedAt: string;
  };
  /** Kết quả tổng: "win" hoặc "loss" (chỉ có sau settle). */
  outcome?: EntryOutcome;
  /** Chi tiết trả thưởng (chỉ có khi entry thắng). */
  payout?: {
    /** Tổng tiền thắng trước payout (VND). */
    winAmount: number;
    /** Số tiền trả thưởng thực tế (VND). */
    payoutAmount: number;
    /** Chi tiết thắng theo từng tier giải. */
    tiers: Array<{
      /** Tier giải thưởng (jackpot1 / jackpot2 / tier1 / tier2 / tier3). */
      tier: PrizeTier;
      /** Số dòng trúng tier này. */
      hitCount: number;
      /** Giá trị giải mỗi dòng (VND). */
      unitAmount: number;
      /** Tổng giải cho tier = unitAmount × hitCount (VND). */
      amount: number;
    }>;
  };
}

export interface PlayerGetTicketEntriesOutput {
  /** Thông tin tóm tắt của vé. */
  ticket: PlayerTicketSummary;
  /** Danh sách entries theo từng kỳ quay. */
  entries: PlayerEntryInfo[];
}

// ─── Get Entry Lines (Player) ───

export interface PlayerGetEntryLinesInput {
  /** ID tenant (đại lý) của người chơi. */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** ID entry cần xem chi tiết dòng cược. */
  entryId: string;
  /** Số lượng dòng mỗi trang. */
  size: number;
  /** lineIndex của phần tử cuối cùng trang trước (cursor). */
  cursor?: number;
}

export interface PlayerLineInfo {
  /** Mã board chứa dòng này (A, B, C, ...). */
  boardNo: string;
  /** Chỉ số dòng trong board (0-based). */
  lineIndex: number;
  /** 6 số chính của dòng cược (zero-padded "01"-"55"). */
  main: string[];
  /** Kết quả so khớp của dòng với kết quả quay. */
  matchResult: {
    /** Số lượng số chính trùng khớp (0-6). */
    mainMatchCount: number;
    /** Có trùng số bonus hay không. */
    bonusMatched: boolean;
    /**
     * Tier giải thưởng cao nhất (null nếu không trúng).
     * - jackpot1: trùng 6/6 số chính
     * - jackpot2: trùng 5/6 + bonus
     * - tier3: trùng 5/6 (không bonus)
     * - tier4: trùng 4/6
     * - tier5: trùng 3/6
     */
    tier: string | null;
    /** Giá trị giải thưởng cho dòng này (VND). 0 nếu không trúng hoặc là jackpot (trả riêng). */
    prizeAmount: number;
  };
}

export interface PlayerGetEntryLinesOutput {
  /** ID entry đang xem. */
  entryId: string;
  /** ID kỳ quay mà entry thuộc về. */
  drawId: string;
  /** Danh sách dòng cược trong trang hiện tại. */
  lines: PlayerLineInfo[];
  /** Cursor cho trang tiếp theo. Null nếu hết dữ liệu. */
  nextCursor: number | null;
  /** Số lượng mỗi trang. */
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
 * Chi tiết giải thưởng 1 hạng trong kết quả kỳ quay Power 6/55.
 *
 * Power 6/55 có 5 hạng giải:
 *   - jackpot1: trùng 6/6 số chính (tích luỹ)
 *   - jackpot2: trùng 5/6 số chính + bonus number (tích luỹ)
 *   - tier1:    trùng 5/6 (cố định 40.000.000đ)
 *   - tier2:    trùng 4/6 (cố định 500.000đ)
 *   - tier3:    trùng 3/6 (cố định 50.000đ)
 */
export interface PlayerDrawTierPrize {
  /**
   * Hạng giải — giá trị từ PrizeTier enum.
   * "jackpot1" | "jackpot2" | "tier1" | "tier2" | "tier3"
   */
  tier: string;
  /**
   * Số lượt trúng hạng này (tổng hit count từ tất cả entries).
   * Không phải số người chơi — 1 người chơi bao có thể trúng nhiều lần.
   */
  winnerCount: number;
  /**
   * Tổng tiền thưởng hạng này (VND).
   * jackpot1/jackpot2: = pool đầu kỳ + contribution (sau FinalizeSettle).
   * tier1/tier2/tier3: tổng tiền cố định aggregate từ entries.
   * 0 nếu winnerCount = 0.
   */
  prizeAmount: number;
}

/**
 * Chi tiết kết quả 1 kỳ quay Power 6/55 — dùng cho trang xem kết quả.
 *
 * Khác Mega 6/45: có thêm `bonusNumber` + dual jackpot (jackpot1 + jackpot2).
 * Bao gồm: kết quả 6 số + bonus, jackpot snapshot, bảng giải thưởng 5 hạng.
 * Chỉ trả cho draws đã settle có kết quả.
 *
 * Dùng bởi endpoint: GET /games/power655/draw-results/:drawId
 */
export interface PlayerDrawResultInfo {
  /** Mã kỳ quay (VD: "2026-03-08.001"). */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày (luôn = 1 cho Power 6/55). */
  drawNo: number;
  /** Giờ quay (ISO 8601). */
  drawTime: string;
  /**
   * Kết quả kỳ quay.
   * Power 6/55: 6 số chính + 1 bonus number (từ 49 số còn lại).
   */
  result: {
    /** 6 số chính trúng thưởng (sorted, zero-padded "01"-"55"). */
    winningMain: string[];
    /** Số đặc biệt (bonus number), zero-padded "01"-"55". */
    bonusNumber: string;
    /** Thời điểm công bố (ISO 8601). */
    publishedAt: string;
  };
  /**
   * Snapshot dual Jackpot tại kỳ quay này.
   * Power 6/55 có 2 jackpot tích luỹ chạy song song.
   */
  jackpot: {
    /** Jackpot 1 đầu kỳ (VND) — giải trùng 6/6. */
    openingJackpot1: number;
    /** Jackpot 1 cuối kỳ (VND). */
    closingJackpot1: number;
    /** Jackpot 2 đầu kỳ (VND) — giải trùng 5/6 + bonus. */
    openingJackpot2: number;
    /** Jackpot 2 cuối kỳ (VND). */
    closingJackpot2: number;
  };
  /**
   * Bảng giải thưởng chi tiết — 5 hạng, luôn có mặt đủ (kể cả winnerCount = 0).
   * Thứ tự: jackpot1, jackpot2, tier1, tier2, tier3.
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
 * Tóm tắt 1 kỳ quay Power 6/55 trong danh sách.
 *
 * Chứa kết quả 6 số + bonus + jackpot snapshot.
 * Không có bảng giải thưởng chi tiết (xem ở detail endpoint).
 *
 * Dùng bởi endpoint: GET /games/power655/draw-results
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
   * Kết quả kỳ quay — 6 số chính + bonus number.
   */
  result: {
    /** 6 số chính trúng thưởng (sorted, zero-padded "01"-"55"). */
    winningMain: string[];
    /** Số bonus, zero-padded "01"-"55". */
    bonusNumber: string;
    /** Thời điểm công bố (ISO 8601). */
    publishedAt: string;
  };
  /** Dual jackpot snapshot — hữu ích để hiển thị kỳ có trúng Jackpot không. */
  jackpot: {
    /** JP1 đầu kỳ (VND). */
    openingJackpot1: number;
    /** JP1 cuối kỳ (VND). */
    closingJackpot1: number;
    /** JP2 đầu kỳ (VND). */
    openingJackpot2: number;
    /** JP2 cuối kỳ (VND). */
    closingJackpot2: number;
  };
  /** Tham chiếu Vietlott (nếu có). */
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

export interface PlayerListDrawResultsOutput {
  /** Danh sách tóm tắt kỳ quay. */
  draws: PlayerDrawResultSummary[];
  /** Cursor cho trang tiếp theo (drawId). Null nếu hết dữ liệu. */
  nextCursor: string | null;
  /** Số lượng mỗi trang. */
  size: number;
}
