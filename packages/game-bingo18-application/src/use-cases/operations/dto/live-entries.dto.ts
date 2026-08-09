/**
 * Bingo 18 – Live Entries DTO
 *
 * Dùng cho live feed panel trên dashboard vận hành.
 * Bingo 18: boards[] chứa cả cơ bản và bổ sung, phân biệt qua playType.
 * Cấu trúc board có number? + tripleKind? (cơ bản) + sum? + bet? (bổ sung).
 */

import type { Bingo18BigSmallBet, Bingo18PlayType, Bingo18TripleKind } from "@megawin/game-bingo18/entities";

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

// ─── Board ───────────────────────────────────────────────────────────────────

/**
 * Một board trong entry Bingo 18 — cả cơ bản và bổ sung.
 *
 * - singleNum/doubleMatch: number bắt buộc.
 * - tripleMatch: tripleKind bắt buộc, number nếu specific.
 * - sumTotal: sum bắt buộc.
 * - bigSmallDraw: bet bắt buộc.
 */
export interface LiveEntryBoard {
  /** Mã board (format "B01", "B02",...). */
  boardNo: string;
  /** Loại cược: singleNum | doubleMatch | tripleMatch | sumTotal | bigSmallDraw. */
  playType: Bingo18PlayType;
  /**
   * Số đã chọn (1-6).
   * Dùng cho singleNum + doubleMatch + tripleMatch-specific.
   * undefined với tripleMatch-any, sumTotal, bigSmallDraw.
   */
  number?: number;
  /**
   * Phân loại triple: "specific" hoặc "any".
   * Chỉ set cho tripleMatch.
   */
  tripleKind?: Bingo18TripleKind;
  /** Tổng cụ thể đã chọn (3-18). Chỉ set cho sumTotal. */
  sum?: number;
  /** Cược lớn/hòa/nhỏ: "big" | "draw" | "small". Chỉ set cho bigSmallDraw. */
  bet?: Bingo18BigSmallBet;
}

// ─── Output ───────────────────────────────────────────────────────────────────

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
