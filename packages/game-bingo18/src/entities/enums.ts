/**
 * Bingo 18 – Enums & Constants (đặc thù game)
 *
 * Chỉ chứa enums/constants ĐẶC THÙ cho Bingo 18.
 * Shared enums (TicketStatus, EntryStatus, DrawStatus, DrawResultSource,
 * TicketChannel, GameConfigScope) → import trực tiếp từ @megawin/game-core/entities.
 *
 * Collections MongoDB:
 *   bingo18_tickets, bingo18_ticket_entries, bingo18_draws, bingo18_game_configs
 *
 * Bingo 18 (Vietlott):
 * - Quay 3 số từ tập {1, 2, 3, 4, 5, 6}, mỗi 6 phút 1 kỳ
 * - Phát hành từ 06:00 đến 21:53 hàng ngày
 * - Cách chơi cơ bản: Một số, Hai số trùng nhau, Ba số trùng nhau
 * - Cách chơi bổ sung: Cộng tổng, Lớn Hòa Nhỏ
 */

// ─────────────────────────────────────────────
// Collection Names
// ─────────────────────────────────────────────

export const Bingo18Collections = {
  Tickets: "bingo18_tickets",
  TicketEntries: "bingo18_ticket_entries",
  Draws: "bingo18_draws",
  DrawCounters: "bingo18_draw_counters",
  GameConfigs: "bingo18_game_configs",
} as const;

// ─────────────────────────────────────────────
// Play Type – Cách chơi
// ─────────────────────────────────────────────

/**
 * Kiểu chơi Bingo 18.
 *
 * Cách chơi cơ bản:
 * | Type        | Mô tả                                                   |
 * |-------------|---------------------------------------------------------|
 * | singleNum   | Chọn 1 số (1-6). Trúng theo số lần xuất hiện (1/2/3).  |
 * | doubleMatch | Chọn cặp trùng nhau (11,22,33,44,55,66).               |
 * | tripleMatch | Chọn bộ 3 trùng (111-666) hoặc "bất kỳ".              |
 *
 * Cách chơi bổ sung (side bet):
 * | Type          | Mô tả                                                 |
 * |---------------|-------------------------------------------------------|
 * | sumTotal      | Đặt tổng cụ thể (3-18).                              |
 * | bigSmallDraw  | Đặt Lớn (12-18) / Hòa (10-11) / Nhỏ (3-9).          |
 */
export const Bingo18PlayType = {
  SingleNum: "singleNum",
  DoubleMatch: "doubleMatch",
  TripleMatch: "tripleMatch",
  SumTotal: "sumTotal",
  BigSmallDraw: "bigSmallDraw",
} as const;

export type Bingo18PlayType =
  (typeof Bingo18PlayType)[keyof typeof Bingo18PlayType];

export const BINGO18_PLAY_TYPE_VALUES = Object.values(Bingo18PlayType);

/** Play types thuộc cách chơi cơ bản (chọn số). */
export const BINGO18_BASIC_PLAY_TYPES: readonly Bingo18PlayType[] = [
  Bingo18PlayType.SingleNum,
  Bingo18PlayType.DoubleMatch,
  Bingo18PlayType.TripleMatch,
];

/** Play types thuộc cách chơi bổ sung (side bet). */
export const BINGO18_SIDE_BET_PLAY_TYPES: readonly Bingo18PlayType[] = [
  Bingo18PlayType.SumTotal,
  Bingo18PlayType.BigSmallDraw,
];

/** Narrowed type cho side bet play types. */
export type Bingo18SideBetPlayType =
  | typeof Bingo18PlayType.SumTotal
  | typeof Bingo18PlayType.BigSmallDraw;

// ─────────────────────────────────────────────
// Side Bet Selection – Cách chơi bổ sung
// ─────────────────────────────────────────────

/**
 * Lựa chọn cách chơi bổ sung Lớn/Hòa/Nhỏ.
 *
 * Dựa vào tổng 3 số quay:
 * - Nhỏ: tổng từ 3 đến 9
 * - Hòa: tổng 10 hoặc 11
 * - Lớn: tổng từ 12 đến 18
 */
export const Bingo18BigSmallBet = {
  Big: "big",
  Draw: "draw",
  Small: "small",
} as const;

export type Bingo18BigSmallBet =
  (typeof Bingo18BigSmallBet)[keyof typeof Bingo18BigSmallBet];

// ─────────────────────────────────────────────
// Triple Match Selection
// ─────────────────────────────────────────────

/**
 * Lựa chọn ba số trùng nhau: chọn cụ thể (1-6) hoặc "bất kỳ".
 */
export const Bingo18TripleKind = {
  Specific: "specific",
  Any: "any",
} as const;

export type Bingo18TripleKind =
  (typeof Bingo18TripleKind)[keyof typeof Bingo18TripleKind];

// ─────────────────────────────────────────────
// Payout Status
// ─────────────────────────────────────────────

export const PayoutStatus = {
  Pending: "pending",
  Dispatched: "dispatched",
  Confirmed: "confirmed",
  Failed: "failed",
} as const;

export type PayoutStatus = (typeof PayoutStatus)[keyof typeof PayoutStatus];

// ─────────────────────────────────────────────
// Refund Status
// ─────────────────────────────────────────────

export const RefundStatus = {
  Pending: "pending",
  Dispatched: "dispatched",
  Confirmed: "confirmed",
  Failed: "failed",
} as const;

export type RefundStatus = (typeof RefundStatus)[keyof typeof RefundStatus];
