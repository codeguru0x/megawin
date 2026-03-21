/**
 * Max 3D – Live Entries DTO
 *
 * Dùng cho live feed panel trên dashboard vận hành.
 * Mỗi entry được rút gọn để render nhanh trên UI.
 *
 * Max 3D đặc thù: board có playMode (basic/plus) + triplets (string[]).
 * Plus mode có 2 triplets; basic có 1 triplet.
 */

import type { PlayMode, PlayType } from "@megawin/game-max3d/entities";

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
  /** Cách chơi: basic / plus. */
  playMode: PlayMode;
  /** Kiểu chơi: straight / combo3 / combo6. */
  playType: PlayType;
  /**
   * Danh sách bộ ba số (zero-padded "000"-"999").
   * - basic: 1 triplet
   * - plus: 2 triplets
   */
  triplets: string[];
  /** Số lines expanded của board (1, 3, hoặc 6 với combo). */
  lineCount: number;
  /** Số lần cược nhân bội của board (≥ 1). Hiển thị badge ×N khi > 1. */
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
  /** Tổng số lines matching. */
  lineCount: number;
  /** Tổng đơn vị cược = Σ(lineCount × betCount). Dùng cho KPI. */
  betUnitCount: number;
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
