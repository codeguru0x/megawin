/**
 * Max 3D – Enums & Constants (đặc thù game)
 *
 * Shared enums (TicketStatus, EntryStatus, DrawStatus, DrawResultSource,
 * TicketChannel, GameConfigScope) → import từ @megawin/game-core/entities.
 *
 * Collections MongoDB:
 *   max3d_tickets, max3d_ticket_entries, max3d_ticket_lines,
 *   max3d_draws, max3d_game_configs
 */

// ─────────────────────────────────────────────
// Collection Names
// ─────────────────────────────────────────────

export const Max3dCollections = {
  Tickets: "max3d_tickets",
  TicketEntries: "max3d_ticket_entries",
  TicketLines: "max3d_ticket_lines",
  Draws: "max3d_draws",
  GameConfigs: "max3d_game_configs",
} as const;

// ─────────────────────────────────────────────
// Play Mode (cách chơi chính)
// ─────────────────────────────────────────────

/**
 * Cách chơi Max 3D.
 *
 * | Mode     | Mô tả                          | Số bộ ba |
 * |----------|--------------------------------|----------|
 * | basic    | Max 3D Cơ Bản – 1 bộ ba số    | 1        |
 * | plus     | Max 3D+ – 2 bộ ba số           | 2        |
 */
export const PlayMode = {
  /** Max 3D Cơ Bản: chọn 1 bộ ba số (000-999). */
  Basic: "basic",
  /** Max 3D+: chọn 2 bộ ba số (000-999). */
  Plus: "plus",
} as const;

export type PlayMode = (typeof PlayMode)[keyof typeof PlayMode];

export const PLAY_MODE_VALUES = Object.values(PlayMode);

// ─────────────────────────────────────────────
// Play Type (kiểu chơi trên mỗi board)
// ─────────────────────────────────────────────

/**
 * Kiểu chơi trên mỗi board.
 *
 * | Type     | Mô tả                                        |
 * |----------|----------------------------------------------|
 * | straight | So khớp chính xác thứ tự (Cơ bản)            |
 * | combo3   | Tổ hợp 3: so khớp BẤT KỲ thứ tự, 3 chữ số giống nhau hoặc 2 giống → 3 hoán vị |
 * | combo6   | Tổ hợp 6: 3 chữ số khác nhau → 6 hoán vị     |
 */
export const PlayType = {
  /** So khớp chính xác thứ tự. */
  Straight: "straight",
  /** Tổ hợp 3: 2 chữ số giống nhau → 3 hoán vị. Giải thưởng = straight / 3 (x2 nếu 3 giống). */
  Combo3: "combo3",
  /** Tổ hợp 6: 3 chữ số khác nhau → 6 hoán vị. Giải thưởng = straight / 6 (x2 nếu trùng 2 hoán vị). */
  Combo6: "combo6",
} as const;

export type PlayType = (typeof PlayType)[keyof typeof PlayType];

export const PLAY_TYPE_VALUES = Object.values(PlayType);

// ─────────────────────────────────────────────
// Prize Tier – Max 3D Cơ Bản (1 bộ ba số)
// ─────────────────────────────────────────────

/**
 * 4 hạng giải cho Max 3D Cơ Bản (cách chơi 1 bộ ba số).
 *
 * | Tier      | Điều kiện                                | Default VND |
 * |-----------|------------------------------------------|-------------|
 * | special   | Trùng 1 trong 2 bộ ba số giải Đặc Biệt  | 1,000,000   |
 * | first     | Trùng 1 trong 4 bộ ba số giải Nhất       | 350,000     |
 * | second    | Trùng 1 trong 6 bộ ba số giải Nhì        | 210,000     |
 * | third     | Trùng 1 trong 8 bộ ba số giải Ba         | 100,000     |
 */
export const BasicPrizeTier = {
  Special: "special",
  First: "first",
  Second: "second",
  Third: "third",
} as const;

export type BasicPrizeTier = (typeof BasicPrizeTier)[keyof typeof BasicPrizeTier];

export const BASIC_PRIZE_TIER_VALUES = Object.values(BasicPrizeTier);

// ─────────────────────────────────────────────
// Prize Tier – Max 3D+ (2 bộ ba số)
// ─────────────────────────────────────────────

/**
 * 7 hạng giải cho Max 3D+ (cách chơi 2 bộ ba số).
 *
 * | Tier      | Điều kiện                                           | Default VND     |
 * |-----------|-----------------------------------------------------|-----------------|
 * | special   | Trùng 2 bộ ba số quay thưởng giải Đặc Biệt          | 1,000,000,000   |
 * | first     | Trùng 2 trong 4 bộ ba số quay thưởng giải Nhất       | 40,000,000      |
 * | second    | Trùng 2 trong 6 bộ ba số quay thưởng giải Nhì        | 10,000,000      |
 * | third     | Trùng 2 trong 8 bộ ba số quay thưởng giải Ba         | 5,000,000       |
 * | fourth    | Trùng 2 bộ ba số của giải ĐB, Nhất, Nhì hoặc Ba     | 1,000,000       |
 * | fifth     | Trùng 1 bộ ba số quay thưởng giải Đặc Biệt bất kỳ   | 150,000         |
 * | sixth     | Trùng 1 bộ ba số quay thưởng Nhất, Nhì hoặc Ba      | 40,000          |
 */
export const PlusPrizeTier = {
  Special: "special",
  First: "first",
  Second: "second",
  Third: "third",
  Fourth: "fourth",
  Fifth: "fifth",
  Sixth: "sixth",
} as const;

export type PlusPrizeTier = (typeof PlusPrizeTier)[keyof typeof PlusPrizeTier];

export const PLUS_PRIZE_TIER_VALUES = Object.values(PlusPrizeTier);
