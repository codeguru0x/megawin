/**
 * Keno – Live Entries DTO
 *
 * Dùng cho live feed panel trên dashboard vận hành.
 * Keno có cả basic boards (pick1-10) và side bets (bigSmall, evenOdd).
 * Không có expandedLines vì 1 board = 1 selection = 1 line.
 */

// ─── Input ────────────────────────────────────────────────────────────────────

export interface GetLiveEntriesInput {
  /** Mã kỳ quay cần lấy entries. */
  drawId: string;
  /**
   * Số entries tối đa cần trả về.
   * Mặc định 50, tối đa 100.
   */
  limit?: number;
}

/** Một board cơ bản (pick1-pick10) trong entry. */
export interface LiveEntryBoard {
  /** Kiểu chơi (pick1, pick2, ..., pick10). */
  playType: string;
  /** Panel index (0 = A, 1 = B). */
  boardNo: number;
  /** Danh sách số đã chọn (1-10 số, zero-padded string "01"-"80"). */
  numbers: string[];
}

/** Một side bet trong entry. */
export interface LiveEntrySideBet {
  /**
   * Loại side bet: "bigSmall" | "evenOdd".
   */
  playType: string;
  /** Lựa chọn: "big" | "bigSmallDraw" | "small" | "even" | ... */
  bet: string;
}

/** Một entry rút gọn cho live feed. */
export interface LiveEntryItem {
  /** Entry ID (MongoDB hex). */
  entryId: string;
  /** Tên người dùng (display). */
  username: string;
  /** Tenant ID (đại lý). */
  tenantId: string;
  /** Tổng tiền cược (VND). */
  amount: number;
  /** Số boards cơ bản. */
  boardCount: number;
  /** Số side bets. */
  sideBetCount: number;
  /** Danh sách boards cơ bản (tối đa 2). */
  boards: LiveEntryBoard[];
  /** Danh sách side bets. */
  sideBets: LiveEntrySideBet[];
  /** Thời điểm đặt cược (ISO 8601). */
  createdAt: string;
}

export interface GetLiveEntriesOutput {
  /** Mã kỳ quay. */
  drawId: string;
  /** Danh sách entries mới nhất, sort createdAt desc. */
  entries: LiveEntryItem[];
  /** Tổng số entries trong kỳ (để hiển thị badge). */
  totalCount: number;
}
