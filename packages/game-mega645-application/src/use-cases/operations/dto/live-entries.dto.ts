/**
 * Mega 6/45 – Live Entries DTO
 *
 * Dùng cho live feed panel trên dashboard vận hành.
 * Mỗi entry được rút gọn để render nhanh trên UI.
 *
 * Mega 6/45: board chỉ có mainNumbers (01-45), không có specialNumbers.
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

/** Một board (selection) trong entry — Mega 6/45 không có specialNumbers. */
export interface LiveEntryBoard {
  /** Kiểu chơi (standard, bao5, quickPick, ...). */
  playType: string;
  /** Danh sách số chính đã chọn (zero-padded string, "01"-"45"). */
  mainNumbers: string[];
  /** Số lines expanded của board này. */
  expandedLines: number;
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
  /** Tổng số lines. */
  lineCount: number;
  /** Danh sách boards (bộ số và kiểu chơi). */
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
