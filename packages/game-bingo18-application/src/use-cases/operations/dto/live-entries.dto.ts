/**
 * Bingo 18 – Live Entries DTO
 *
 * Dùng cho live feed panel trên dashboard vận hành.
 * Bingo 18 có boards cơ bản (singleNum/doubleMatch/tripleMatch) tách biệt side bets.
 * Cấu trúc khác Keno: board có number? + tripleKind?, side bet có sum? + bet?.
 */

import type {
  Bingo18PlayType,
  Bingo18BigSmallBet,
  Bingo18TripleKind,
} from "@megawin/game-bingo18/entities";

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

// ─── Board & SideBet ─────────────────────────────────────────────────────────

/**
 * Một board cơ bản trong entry Bingo 18.
 * Basic boards: singleNum (1 số), doubleMatch (1 cặp), tripleMatch (specific/any).
 */
export interface LiveEntryBoard {
  /** Mã board (format "B01", "B02",...). */
  boardNo: string;
  /** Loại cược: singleNum | doubleMatch | tripleMatch. */
  playType: Bingo18PlayType;
  /**
   * Số đã chọn (1-6).
   * Dùng cho singleNum + doubleMatch + tripleMatch-specific.
   * undefined với tripleMatch-any.
   */
  number?: number;
  /**
   * Phân loại triple: "specific" hoặc "any".
   * Chỉ set cho tripleMatch.
   */
  tripleKind?: Bingo18TripleKind;
}

/**
 * Một side bet trong entry Bingo 18.
 * sumTotal: chọn tổng cụ thể (3-18). bigSmallDraw: chọn lớn/hòa/nhỏ.
 */
export interface LiveEntrySideBet {
  /** Loại side bet: sumTotal | bigSmallDraw. */
  playType: Bingo18PlayType;
  /**
   * Tổng cụ thể đã chọn (3-18).
   * Chỉ set cho sumTotal.
   */
  sum?: number;
  /**
   * Cược lớn/hòa/nhỏ: "big" | "draw" | "small".
   * Chỉ set cho bigSmallDraw.
   */
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
  /** Số boards cơ bản. */
  boardCount: number;
  /** Số side bets. */
  sideBetCount: number;
  /** Danh sách boards cơ bản (tối đa 6). */
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
