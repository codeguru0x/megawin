/**
 * Max 3D Pro – Live Entries DTO
 *
 * Dùng cho live feed panel trên dashboard vận hành.
 * Mỗi entry được rút gọn để render nhanh trên UI.
 *
 * Max 3D Pro đặc thù:
 * - board có playMode (multiNumber/multiDigit) + triplets (string[]).
 * - multiDigit: có thêm frontDigits + backDigits (3 chữ số mỗi bên).
 * - lineCount = số cặp TripletPair expand ra từ board.
 */

import type { PlayMode, PlayType } from "@megawin/game-max3dpro/entities";

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

/**
 * Một board trong entry, hiển thị bộ ba số và cách chơi.
 */
export interface LiveEntryBoard {
  /** Ký hiệu board: A, B, C, D. */
  boardNo: string;
  /** Cách chơi: multiNumber / multiDigit. */
  playMode: PlayMode;
  /** Kiểu chơi: straight / quickPick. */
  playType: PlayType;
  /**
   * Danh sách bộ ba số đã chọn (multiNumber: 3-20 bộ ba; multiDigit: expand từ digits).
   * Dùng để hiển thị "123 - 456" format (multiNumber).
   */
  triplets: string[];
  /**
   * Chỉ multiDigit: 3 chữ số đầu người chơi chọn.
   * Dùng để hiển thị "[1,2,3] × [4,5,6]" format.
   */
  frontDigits?: number[];
  /**
   * Chỉ multiDigit: 3 chữ số sau người chơi chọn.
   */
  backDigits?: number[];
  /** Số cặp TripletPair expand ra. multiNumber: C(n,2). multiDigit: perms × perms. */
  lineCount: number;
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
  /** Tổng số TripletPair lines. */
  lineCount: number;
  /** Danh sách boards (bộ ba số và cách chơi). */
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
