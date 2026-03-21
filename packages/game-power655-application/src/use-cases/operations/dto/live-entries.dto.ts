/**
 * Power 6/55 – Live Entries DTO
 *
 * Dùng cho live feed panel trên dashboard vận hành.
 * Power 6/55: board có mainNumbers (01-55), không có specialNumbers trong selection.
 */

export interface GetLiveEntriesInput {
  /** Mã kỳ quay cần lấy entries. */
  drawId: string;
  /**
   * Số entries tối đa cần trả về.
   * Mặc định 50, tối đa 100.
   */
  limit?: number;
}

/** Một board (selection) trong entry. */
export interface LiveEntryBoard {
  /** Kiểu chơi (standard, bao5, bao7, ...). */
  playType: string;
  /** Danh sách số chính đã chọn (zero-padded string, "01"-"55"). */
  mainNumbers: string[];
  /** Số lines expanded của board này. */
  expandedLines: number;
  /** Số lần cược nhân bội (≥ 1). Hiển thị badge ×N khi > 1. */
  betCount?: number;
}

/** Một entry rút gọn cho live feed. */
export interface LiveEntryItem {
  entryId: string;
  username: string;
  tenantId: string;
  /** Tổng tiền cược (VND). */
  amount: number;
  /** Tổng số lines. */
  lineCount: number;
  /**
   * Tổng đơn vị cược = Σ(expandedLines × betCount).
   * Bằng lineCount khi tất cả betCount = 1.
   */
  betUnitCount?: number;
  boards: LiveEntryBoard[];
  /** Thời điểm đặt cược (ISO 8601). */
  createdAt: string;
}

export interface GetLiveEntriesOutput {
  drawId: string;
  entries: LiveEntryItem[];
  totalCount: number;
}
