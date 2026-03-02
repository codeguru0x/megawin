/**
 * Max 3D Pro – Enums & Constants (đặc thù game)
 *
 * Shared enums (TicketStatus, EntryStatus, DrawStatus, DrawResultSource,
 * TicketChannel, GameConfigScope) → import từ @megawin/game-core/entities.
 *
 * Collections MongoDB:
 *   max3d_pro_tickets, max3d_pro_ticket_entries, max3d_pro_ticket_lines,
 *   max3d_pro_draws, max3d_pro_game_configs
 */

// ─────────────────────────────────────────────
// Collection Names
// ─────────────────────────────────────────────

export const Max3dproCollections = {
  Tickets: "max3d_pro_tickets",
  TicketEntries: "max3d_pro_ticket_entries",
  TicketLines: "max3d_pro_ticket_lines",
  Draws: "max3d_pro_draws",
  GameConfigs: "max3d_pro_game_configs",
} as const;

// ─────────────────────────────────────────────
// Play Mode (cách chơi chính)
// ─────────────────────────────────────────────

/**
 * Cách chơi Max 3D Pro.
 *
 * | Mode          | Mô tả                                                      |
 * |---------------|------------------------------------------------------------|
 * | multiNumber   | Chơi bao nhiều bộ số: chọn 3-20 bộ ba số, kết hợp 2 bộ    |
 * | multiDigit    | Chơi bao bộ ba số: chọn 3 số đầu + 3 số sau, hệ thống expand |
 *
 * Cả 2 mode đều tạo ra các cặp (pair) hai bộ ba số để so khớp.
 */
export const PlayMode = {
  /** Chơi bao nhiều bộ số: chọn 3-20 bộ ba số, hệ thống tạo C(n,2) cặp. */
  MultiNumber: "multiNumber",
  /** Chơi bao bộ ba số: chọn 3 chữ số đầu + 3 chữ số sau, hệ thống expand. */
  MultiDigit: "multiDigit",
} as const;

export type PlayMode = (typeof PlayMode)[keyof typeof PlayMode];

export const PLAY_MODE_VALUES = Object.values(PlayMode);

// ─────────────────────────────────────────────
// Play Type (kiểu chơi trên mỗi board)
// ─────────────────────────────────────────────

/**
 * Kiểu chơi trên mỗi board.
 *
 * | Type        | Mô tả                                        |
 * |-------------|----------------------------------------------|
 * | straight    | So khớp chính xác thứ tự                     |
 * | quickPick   | Máy chọn ngẫu nhiên                          |
 */
export const PlayType = {
  Straight: "straight",
  QuickPick: "quickPick",
} as const;

export type PlayType = (typeof PlayType)[keyof typeof PlayType];

export const PLAY_TYPE_VALUES = Object.values(PlayType);

// ─────────────────────────────────────────────
// Prize Tier – Max 3D Pro (2 bộ ba số = 1 cặp)
// ─────────────────────────────────────────────

/**
 * 8 hạng giải cho Max 3D Pro.
 *
 * | Tier             | Điều kiện                                                      | Default VND     |
 * |------------------|----------------------------------------------------------------|-----------------|
 * | special          | Trùng 2 bộ ba số quay thưởng giải ĐB theo đúng thứ tự quay    | 2,000,000,000   |
 * | specialSub       | Trùng 2 bộ ba số quay thưởng giải ĐB ngược thứ tự quay        | 400,000,000     |
 * | first            | Trùng bất kỳ 2 trong 4 bộ ba số quay thưởng giải Nhất         | 30,000,000      |
 * | second           | Trùng bất kỳ 2 trong 6 bộ ba số quay thưởng giải Nhì          | 10,000,000      |
 * | third            | Trùng bất kỳ 2 trong 8 bộ ba số quay thưởng giải Ba           | 4,000,000       |
 * | fourth           | Trùng bất kỳ 2 bộ ba số của giải ĐB, Nhất, Nhì hoặc Ba       | 1,000,000       |
 * | fifth            | Trùng 1 bộ ba số quay thưởng giải ĐB bất kỳ                   | 100,000         |
 * | sixth            | Trùng 1 bộ ba số quay thưởng Nhất, Nhì hoặc Ba bất kỳ         | 40,000          |
 */
export const PrizeTier = {
  Special: "special",
  SpecialSub: "specialSub",
  First: "first",
  Second: "second",
  Third: "third",
  Fourth: "fourth",
  Fifth: "fifth",
  Sixth: "sixth",
} as const;

export type PrizeTier = (typeof PrizeTier)[keyof typeof PrizeTier];

export const PRIZE_TIER_VALUES = Object.values(PrizeTier);

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
