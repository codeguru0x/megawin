/**
 * Keno – Enums & Constants (đặc thù game)
 *
 * Chỉ chứa enums/constants ĐẶC THÙ cho Keno.
 * Shared enums (TicketStatus, EntryStatus, DrawStatus, DrawResultSource,
 * TicketChannel, GameConfigScope) → import trực tiếp từ @megawin/game-core/entities.
 *
 * Collections MongoDB:
 *   kenoTickets, kenoTicketEntries, kenoDraws, kenoGameConfigs
 *
 * Keno Vietlott:
 * - Quay 20 số từ tập 01-80, mỗi 8 phút 1 kỳ, ~120 kỳ/ngày
 * - Cách chơi cơ bản: chọn 1-10 số
 * - Cách chơi bổ sung: Lớn/Nhỏ, Chẵn/Lẻ
 */

// ─────────────────────────────────────────────
// Collection Names
// ─────────────────────────────────────────────

export const KenoCollections = {
  Tickets: "keno_tickets",
  TicketEntries: "keno_ticket_entries",
  Draws: "keno_draws",
  DrawCounters: "keno_draw_counters",
  GameConfigs: "keno_game_configs",
} as const;

// ─────────────────────────────────────────────
// Play Type – Cách chơi
// ─────────────────────────────────────────────

/**
 * Kiểu chơi Keno.
 *
 * Cách chơi cơ bản:
 * | Type     | Chọn         | Mô tả                           |
 * |----------|--------------|----------------------------------|
 * | pick1    | 1 số         | Chọn 1 số từ 01-80               |
 * | ...      | ...          | ...                               |
 * | pick10   | 10 số        | Chọn 10 số từ 01-80              |
 *
 * Cách chơi bổ sung (side bet – Panel C):
 * | Type          | Mô tả                                    |
 * |---------------|------------------------------------------|
 * | bigSmall      | Đặt cược Lớn/Nhỏ                         |
 * | evenOdd       | Đặt cược Chẵn/Lẻ                         |
 */
export const KenoPlayType = {
  Pick1: "pick1",
  Pick2: "pick2",
  Pick3: "pick3",
  Pick4: "pick4",
  Pick5: "pick5",
  Pick6: "pick6",
  Pick7: "pick7",
  Pick8: "pick8",
  Pick9: "pick9",
  Pick10: "pick10",
  BigSmall: "bigSmall",
  EvenOdd: "evenOdd",
} as const;

export type KenoPlayType = (typeof KenoPlayType)[keyof typeof KenoPlayType];

export const KENO_PLAY_TYPE_VALUES = Object.values(KenoPlayType);

/** Play types thuộc cách chơi cơ bản (chọn số). */
export const KENO_BASIC_PLAY_TYPES: readonly KenoPlayType[] = [
  KenoPlayType.Pick1,
  KenoPlayType.Pick2,
  KenoPlayType.Pick3,
  KenoPlayType.Pick4,
  KenoPlayType.Pick5,
  KenoPlayType.Pick6,
  KenoPlayType.Pick7,
  KenoPlayType.Pick8,
  KenoPlayType.Pick9,
  KenoPlayType.Pick10,
];

/** Play types thuộc cách chơi bổ sung (side bet). */
export const KENO_SIDE_BET_PLAY_TYPES: readonly KenoPlayType[] = [
  KenoPlayType.BigSmall,
  KenoPlayType.EvenOdd,
];

/** Narrowed type cho side bet play types — dùng trong board interface khi playType thuộc nhóm bổ sung. */
export type KenoSideBetPlayType = typeof KenoPlayType.BigSmall | typeof KenoPlayType.EvenOdd;

/** Narrowed type cho basic play types — dùng trong board interface khi playType thuộc nhóm cơ bản (chọn số). */
export type KenoBasicPlayType =
  | typeof KenoPlayType.Pick1
  | typeof KenoPlayType.Pick2
  | typeof KenoPlayType.Pick3
  | typeof KenoPlayType.Pick4
  | typeof KenoPlayType.Pick5
  | typeof KenoPlayType.Pick6
  | typeof KenoPlayType.Pick7
  | typeof KenoPlayType.Pick8
  | typeof KenoPlayType.Pick9
  | typeof KenoPlayType.Pick10;

/** Set dùng cho runtime check: playType có thuộc basic (chọn số) hay không. */
export const KENO_BASIC_PLAY_TYPE_SET: ReadonlySet<KenoPlayType> = new Set(KENO_BASIC_PLAY_TYPES);

/** Set dùng cho runtime check: playType có thuộc side bet hay không. */
export const KENO_SIDE_BET_PLAY_TYPE_SET: ReadonlySet<KenoPlayType> = new Set(
  KENO_SIDE_BET_PLAY_TYPES,
);

// ─────────────────────────────────────────────
// Side Bet Selection – Cách chơi bổ sung
// ─────────────────────────────────────────────

/**
 * Lựa chọn cách chơi bổ sung Lớn/Nhỏ.
 *
 * Dựa vào 20 số quay:
 * - Lớn: ≥13 số từ 41-80
 * - Hoà Lớn Nhỏ: 10 số từ 01-40 và 10 số từ 41-80
 * - Nhỏ: ≥13 số từ 01-40
 */
export const KenoBigSmallBet = {
  Big: "big",
  BigSmallDraw: "bigSmallDraw",
  Small: "small",
} as const;

export type KenoBigSmallBet = (typeof KenoBigSmallBet)[keyof typeof KenoBigSmallBet];

/**
 * Lựa chọn cách chơi bổ sung Chẵn/Lẻ.
 *
 * Dựa vào 20 số quay:
 * - Chẵn: ≥15 số chẵn
 * - Chẵn 11-12: 11 hoặc 12 số chẵn
 * - Hoà Chẵn Lẻ: 10 số chẵn và 10 số lẻ
 * - Lẻ 11-12: 11 hoặc 12 số lẻ
 * - Lẻ: ≥15 số lẻ
 */
export const KenoEvenOddBet = {
  Even: "even",
  Even1112: "even1112",
  EvenOddDraw: "evenOddDraw",
  Odd1112: "odd1112",
  Odd: "odd",
} as const;

export type KenoEvenOddBet = (typeof KenoEvenOddBet)[keyof typeof KenoEvenOddBet];

// ─────────────────────────────────────────────
// Payout Status
// ─────────────────────────────────────────────

/**
 * Trạng thái quá trình trả thưởng cho player sau khi entry settled.
 *
 * Lifecycle:
 *   pending → dispatched → confirmed
 *                       → failed (retry)
 *
 * - pending: chờ dispatch (mặc định sau settle)
 * - dispatched: đã gửi lệnh trả thưởng tới payment service, chờ confirm
 * - confirmed: payment service xác nhận thành công
 * - failed: dispatch thất bại sau N lần retry
 */
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

/**
 * Trạng thái quá trình hoàn tiền cho player khi draw bị void.
 *
 * Lifecycle giống PayoutStatus:
 *   pending → dispatched → confirmed
 *                       → failed (retry)
 *
 * - pending: chờ dispatch (mặc định sau void-entries step)
 * - dispatched: đã gửi lệnh hoàn tiền tới payment service
 * - confirmed: payment service xác nhận hoàn tiền thành công
 * - failed: dispatch thất bại sau N lần retry — cần can thiệp thủ công
 */
export const RefundStatus = {
  Pending: "pending",
  Dispatched: "dispatched",
  Confirmed: "confirmed",
  Failed: "failed",
} as const;

export type RefundStatus = (typeof RefundStatus)[keyof typeof RefundStatus];
