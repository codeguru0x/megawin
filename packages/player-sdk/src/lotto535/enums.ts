/**
 * Lotto 5/35 SDK – Public Enums
 *
 * Các enum constants cho game Lotto 5/35.
 *
 * @module
 */

// ─────────────────────────────────────────────
// Play Type
// ─────────────────────────────────────────────

/**
 * Kiểu chơi Lotto 5/35.
 *
 * | Value            | Mô tả                            | Số main | Số special | Số lines |
 * |------------------|----------------------------------|---------|------------|----------|
 * | `"standard"`     | 5 chính + 1 đặc biệt            | 5       | 1          | 1        |
 * | `"mainCover4"`   | 4 chính + 1 đặc biệt, bỏ 1 chính | 4      | 1          | 31       |
 * | `"mainCover"`    | 6-15 chính + 1 đặc biệt         | 6-15    | 1          | C(N,5)   |
 * | `"specialCover"` | 5 chính + 2-12 đặc biệt         | 5       | 2-12       | K        |
 */
export const Lotto535PlayType = {
  Standard: "standard",
  MainCover4: "mainCover4",
  MainCover: "mainCover",
  SpecialCover: "specialCover",
} as const;

/** Kiểu chơi Lotto 5/35 (union type). */
export type Lotto535PlayType = (typeof Lotto535PlayType)[keyof typeof Lotto535PlayType];

// ─────────────────────────────────────────────
// Ticket Display Status
// ─────────────────────────────────────────────

/**
 * Trạng thái vé Lotto 5/35 hiển thị cho người chơi.
 *
 * - `"pending"` — Đang chờ xử lý / thanh toán
 * - `"active"` — Đã xác nhận, đang tham gia kỳ quay
 * - `"completed"` — Đã hoàn tất tất cả kỳ quay
 */
export const Lotto535TicketDisplayStatus = {
  Pending: "pending",
  Active: "active",
  Completed: "completed",
} as const;

/** Trạng thái vé Lotto 5/35 (union type). */
export type Lotto535TicketDisplayStatus =
  (typeof Lotto535TicketDisplayStatus)[keyof typeof Lotto535TicketDisplayStatus];

// ─────────────────────────────────────────────
// Prize Tier
// ─────────────────────────────────────────────

/**
 * Hạng giải thưởng Lotto 5/35.
 *
 * | Value          | Mô tả                              |
 * |----------------|------------------------------------|
 * | `"jackpot"`    | 5 chính + 1 đặc biệt (Jackpot)    |
 * | `"tier1"`      | 5 chính                            |
 * | `"tier2"`      | 4 chính + 1 đặc biệt              |
 * | `"tier3"`      | 4 chính                            |
 * | `"tier4"`      | 3 chính + 1 đặc biệt              |
 * | `"tier5"`      | 3 chính                            |
 * | `"consolation"`| 2 chính + 1 đặc biệt              |
 */
export const Lotto535PrizeTier = {
  Jackpot: "jackpot",
  Tier1: "tier1",
  Tier2: "tier2",
  Tier3: "tier3",
  Tier4: "tier4",
  Tier5: "tier5",
  Consolation: "consolation",
} as const;

/** Hạng giải thưởng Lotto 5/35 (union type). */
export type Lotto535PrizeTier = (typeof Lotto535PrizeTier)[keyof typeof Lotto535PrizeTier];
