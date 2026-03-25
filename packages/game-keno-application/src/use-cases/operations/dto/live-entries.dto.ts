/**
 * Keno – Live Entries DTO
 *
 * Dùng cho live feed panel trên dashboard vận hành.
 * Keno dùng unified boards[] cho cả basic (pick1-10) và side bets (bigSmall, evenOdd).
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

/**
 * Một board trong entry — cả cơ bản (pick1-pick10) và bổ sung (bigSmall/evenOdd).
 *
 * - Cơ bản: numbers bắt buộc, bet = undefined.
 * - Bổ sung: bet bắt buộc, numbers = undefined.
 */
export interface LiveEntryBoard {
  /** Kiểu chơi (pick1-pick10, bigSmall, evenOdd). */
  playType: string;
  /** Panel identifier: "A", "B", "C". */
  boardNo: string;
  /** Danh sách số đã chọn (1-10 số, zero-padded string "01"-"80"). Chỉ cho cơ bản. */
  numbers?: string[];
  /** Lựa chọn side bet: "big" | "bigSmallDraw" | "small" | "even" | ... Chỉ cho bổ sung. */
  bet?: string;
  /** Số lần cược nhân bội. Hiển thị ×N badge khi > 1. */
  betCount: number;
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
  /** Số boards (cả cơ bản và bổ sung). */
  boardCount: number;
  /** Danh sách boards (cả cơ bản và bổ sung). */
  boards: LiveEntryBoard[];
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
