/**
 * Lotto 5/35 – Enums & Constants (đặc thù game)
 *
 * Chỉ chứa enums/constants ĐẶC THÙ cho Lotto 5/35.
 * Shared enums (TicketStatus, EntryStatus, DrawStatus, DrawResultSource,
 * TicketChannel, GameConfigScope) → import trực tiếp từ @megawin/game-core/entities.
 *
 * Collections MongoDB:
 *   lotto535Tickets, lotto535TicketEntries, lotto535TicketLines,
 *   lotto535Draws, lotto535GameConfigs
 */

// ─────────────────────────────────────────────
// Collection Names
// ─────────────────────────────────────────────

/** Tên các MongoDB collections cho game Lotto 5/35. */
export const Lotto535Collections = {
  /** Collection lưu vé (ticket) đã mua. */
  Tickets: "lotto535_tickets",
  /** Collection lưu entry – mỗi entry = 1 ticket × 1 kỳ quay. */
  TicketEntries: "lotto535_ticket_entries",
  /** Collection lưu line con (bộ số) – tạo khi settle. */
  TicketLines: "lotto535_ticket_lines",
  /** Collection lưu kỳ quay (draw). */
  Draws: "lotto535_draws",
  /** Collection lưu cấu hình game (global + tenant). */
  GameConfigs: "lotto535_game_configs",
  /** Collection lưu vòng đời Jackpot (cycle tích luỹ → chia/trúng). */
  JackpotCycles: "lotto535_jackpot_cycles",
  /** Cycle Ledger — lịch sử tích luỹ per-draw trong jackpot cycle (resettle). */
  JackpotCycleEntries: "lotto535_jackpot_cycle_entries",
} as const;

// ─────────────────────────────────────────────
// Prize Tier
// ─────────────────────────────────────────────

/**
 * 7 hạng giải thưởng Lotto 5/35.
 *
 * Thứ tự ưu tiên: jackpot > tier1 > tier2 > ... > consolation.
 * Mỗi line chỉ trúng hạng **cao nhất** phù hợp.
 *
 * | Tier        | Điều kiện              | Default VND    |
 * |-------------|------------------------|----------------|
 * | jackpot     | 5 chính + đặc biệt    | tích luỹ       |
 * | tier1       | 5 chính               | 10.000.000     |
 * | tier2       | 4 chính + đặc biệt    | 5.000.000 (*)  |
 * | tier3       | 4 chính               | 500.000 (*)    |
 * | tier4       | 3 chính + đặc biệt    | 100.000 (*)    |
 * | tier5       | 3 chính               | 30.000 (*)     |
 * | consolation | chỉ đặc biệt (≤2 chính)| 10.000        |
 *
 * (*) Có thể được bổ sung thêm khi kỳ chia Độc Đắc (split cycle).
 */
export const PrizeTier = {
  Jackpot: "jackpot",
  Tier1: "tier1",
  Tier2: "tier2",
  Tier3: "tier3",
  Tier4: "tier4",
  Tier5: "tier5",
  Consolation: "consolation",
} as const;

export type PrizeTier = (typeof PrizeTier)[keyof typeof PrizeTier];

export const LOTTO535_PRIZE_TIER_VALUES = Object.values(PrizeTier);

/**
 * Các tier tham gia chia Jackpot khi split cycle (không bao gồm consolation).
 * tier1 nhận 2/6, tier2-tier5 mỗi tier nhận 1/6.
 */
export const LOTTO535_SPLIT_ELIGIBLE_TIERS: readonly PrizeTier[] = [
  PrizeTier.Tier1,
  PrizeTier.Tier2,
  PrizeTier.Tier3,
  PrizeTier.Tier4,
  PrizeTier.Tier5,
];

// ─────────────────────────────────────────────
// Play Type
// ─────────────────────────────────────────────

/**
 * Kiểu chơi trên mỗi board.
 *
 * | Type         | Chọn                        | Số lines              |
 * |--------------|-----------------------------|------------------------|
 * | standard     | 5 chính + 1 đặc biệt       | 1                      |
 * | mainCover4   | 4 chính + 1 đặc biệt       | 31 (hệ thống bổ sung)  |
 * | mainCover    | 6-15 chính + 1 đặc biệt    | C(N,5)                 |
 * | specialCover | 5 chính + 2-12 đặc biệt    | K                      |
 */
export const PlayType = {
  Standard: "standard",
  MainCover4: "mainCover4",
  MainCover: "mainCover",
  SpecialCover: "specialCover",
} as const;

export type PlayType = (typeof PlayType)[keyof typeof PlayType];

export const LOTTO535_PLAY_TYPE_VALUES = Object.values(PlayType);
