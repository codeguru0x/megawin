/**
 * Lotto 5/35 SDK – Public Enums
 *
 * Chỉ expose những enums an toàn cho tenant develop client SDK.
 * KHÔNG chứa: internal statuses (void, settling...), expansion modes,
 * draw result sources, config scopes, hay bất kỳ internal enum nào.
 */

// ─────────────────────────────────────────────
// Play Type (kiểu chơi – input khi mua vé)
// ─────────────────────────────────────────────

/**
 * Kiểu chơi trên mỗi board khi mua vé.
 *
 * | Type         | Chọn                        | Số lines  |
 * |--------------|-----------------------------|-----------|
 * | standard     | 5 chính + 1 đặc biệt       | 1         |
 * | mainCover4   | 4 chính + 1 đặc biệt       | 31        |
 * | mainCover    | 6-15 chính + 1 đặc biệt    | C(N,5)    |
 * | specialCover | 5 chính + 2-12 đặc biệt    | K         |
 * | quickPick    | máy chọn ngẫu nhiên         | 1         |
 */
export const Lotto535PlayType = {
  Standard: "standard",
  MainCover4: "mainCover4",
  MainCover: "mainCover",
  SpecialCover: "specialCover",
  QuickPick: "quickPick",
} as const;

export type Lotto535PlayType =
  (typeof Lotto535PlayType)[keyof typeof Lotto535PlayType];

// ─────────────────────────────────────────────
// Ticket Status (subset an toàn cho UI khách)
// ─────────────────────────────────────────────

/**
 * Trạng thái vé hiển thị cho người chơi.
 * Chỉ bao gồm các trạng thái mà UI player cần biết.
 */
export const Lotto535TicketDisplayStatus = {
  /** Đang chờ xử lý / thanh toán. */
  Pending: "pending",
  /** Đã xác nhận, đang tham gia kỳ quay. */
  Active: "active",
  /** Đã hoàn tất tất cả kỳ quay. */
  Completed: "completed",
} as const;

export type Lotto535TicketDisplayStatus =
  (typeof Lotto535TicketDisplayStatus)[keyof typeof Lotto535TicketDisplayStatus];

// ─────────────────────────────────────────────
// Prize Tier (thông tin giải thưởng cho UI)
// ─────────────────────────────────────────────

/**
 * Hạng giải thưởng – cho UI hiển thị kết quả trúng thưởng.
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

export type Lotto535PrizeTier =
  (typeof Lotto535PrizeTier)[keyof typeof Lotto535PrizeTier];
