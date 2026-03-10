/**
 * Lotto 5/35 – Live Entries DTO
 *
 * Dùng cho live feed panel trên dashboard vận hành.
 * Mỗi entry được rút gọn để render nhanh trên UI.
 */

// ─────────────────────────────────────────────
// GetLiveEntries
// ─────────────────────────────────────────────

export interface GetLiveEntriesInput {
  /** Mã kỳ quay cần lấy entries. */
  drawId: string;
  /**
   * Số entries tối đa cần trả về.
   * Mặc định 50, tối đa 100.
   */
  limit?: number;
}

/** Một board (selection) trong entry, dùng để hiển thị bộ số. */
export interface LiveEntryBoard {
  /** Kiểu chơi (Standard, MainCover, ...). */
  playType: string;
  /** Danh sách số chính đã chọn (zero-padded string, "01"-"35"). */
  mainNumbers: string[];
  /** Danh sách số đặc biệt đã chọn (zero-padded string, "01"-"12"). */
  specialNumbers: string[];
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
