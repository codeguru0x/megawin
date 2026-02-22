/**
 * Keno – Enums & Constants
 *
 * Quy ước đặt tên: {Game}{Concept} – KenoTicketStatus, KenoDrawStatus…
 *
 * Dùng **const object pattern** (giống Lotto535) để vừa có runtime values vừa type safety.
 *
 * Collections MongoDB:
 *   kenoTickets, kenoTicketEntries, kenoDraws, kenoGameConfigs
 *
 * Keno Vietlott:
 * - Quay 20 số từ tập 01-80, mỗi 10 phút 1 kỳ, ~288 kỳ/ngày
 * - Cách chơi cơ bản: chọn 1-10 số
 * - Cách chơi bổ sung: Lớn/Nhỏ, Chẵn/Lẻ
 */

// ─────────────────────────────────────────────
// Collection Names
// ─────────────────────────────────────────────

export const KenoCollections = {
  Tickets: "kenoTickets",
  TicketEntries: "kenoTicketEntries",
  Draws: "kenoDraws",
  GameConfigs: "kenoGameConfigs",
} as const;

// ─────────────────────────────────────────────
// Product Identifier
// ─────────────────────────────────────────────

export const KenoProduct = "keno" as const;
export type KenoProduct = typeof KenoProduct;

// ─────────────────────────────────────────────
// Currency
// ─────────────────────────────────────────────

export const Currency = {
  VND: "VND",
} as const;

export type Currency = (typeof Currency)[keyof typeof Currency];

// ─────────────────────────────────────────────
// Ticket Status
// ─────────────────────────────────────────────

/**
 * Vòng đời trạng thái vé Keno.
 *
 * Flow: draft → paid → completed
 *                ↘ refunded / void
 */
export const KenoTicketStatus = {
  Draft: "draft",
  Paid: "paid",
  Refunded: "refunded",
  Void: "void",
  Completed: "completed",
} as const;

export type KenoTicketStatus =
  (typeof KenoTicketStatus)[keyof typeof KenoTicketStatus];

export const KENO_TICKET_STATUS_VALUES = Object.values(KenoTicketStatus);

// ─────────────────────────────────────────────
// Entry Status
// ─────────────────────────────────────────────

/**
 * Trạng thái entry Keno (vé tham gia 1 kỳ quay).
 *
 * Flow: scheduled → active → drawn → settled
 *                               ↘ void
 */
export const KenoEntryStatus = {
  Scheduled: "scheduled",
  Active: "active",
  Drawn: "drawn",
  Settled: "settled",
  Void: "void",
} as const;

export type KenoEntryStatus =
  (typeof KenoEntryStatus)[keyof typeof KenoEntryStatus];

export const KENO_ENTRY_STATUS_VALUES = Object.values(KenoEntryStatus);

// ─────────────────────────────────────────────
// Draw Status
// ─────────────────────────────────────────────

/**
 * Trạng thái kỳ quay Keno.
 *
 * Flow: scheduled → salesOpen → salesClosed → drawing → published → settling → settled
 *                                                                              ↘ void
 */
export const KenoDrawStatus = {
  Scheduled: "scheduled",
  SalesOpen: "salesOpen",
  SalesClosed: "salesClosed",
  Drawing: "drawing",
  Published: "published",
  Settling: "settling",
  Settled: "settled",
  Void: "void",
} as const;

export type KenoDrawStatus =
  (typeof KenoDrawStatus)[keyof typeof KenoDrawStatus];

export const KENO_DRAW_STATUS_VALUES = Object.values(KenoDrawStatus);

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
 * | pick2    | 2 số         | Chọn 2 số từ 01-80               |
 * | pick3    | 3 số         | Chọn 3 số từ 01-80               |
 * | pick4    | 4 số         | Chọn 4 số từ 01-80               |
 * | pick5    | 5 số         | Chọn 5 số từ 01-80               |
 * | pick6    | 6 số         | Chọn 6 số từ 01-80               |
 * | pick7    | 7 số         | Chọn 7 số từ 01-80               |
 * | pick8    | 8 số         | Chọn 8 số từ 01-80               |
 * | pick9    | 9 số         | Chọn 9 số từ 01-80               |
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

export type KenoPlayType =
  (typeof KenoPlayType)[keyof typeof KenoPlayType];

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

export type KenoBigSmallBet =
  (typeof KenoBigSmallBet)[keyof typeof KenoBigSmallBet];

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

export type KenoEvenOddBet =
  (typeof KenoEvenOddBet)[keyof typeof KenoEvenOddBet];

// ─────────────────────────────────────────────
// Draw Result Source
// ─────────────────────────────────────────────

export const DrawResultSource = {
  Vietlott: "vietlott",
  Manual: "manual",
  Import: "import",
} as const;

export type DrawResultSource =
  (typeof DrawResultSource)[keyof typeof DrawResultSource];

// ─────────────────────────────────────────────
// Ticket Channel
// ─────────────────────────────────────────────

export const TicketChannel = {
  Pos: "pos",
  Web: "web",
  Sdk: "sdk",
} as const;

export type TicketChannel =
  (typeof TicketChannel)[keyof typeof TicketChannel];

// ─────────────────────────────────────────────
// Game Config Scope
// ─────────────────────────────────────────────

export const GameConfigScope = {
  Global: "global",
  Tenant: "tenant",
} as const;

export type GameConfigScope =
  (typeof GameConfigScope)[keyof typeof GameConfigScope];
