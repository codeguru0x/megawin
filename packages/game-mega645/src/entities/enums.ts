/**
 * Mega 6/45 – Enums & Constants (đặc thù game)
 *
 * Chỉ chứa enums/constants ĐẶC THÙ cho Mega 6/45.
 * Shared enums (TicketStatus, EntryStatus, DrawStatus, DrawResultSource,
 * TicketChannel, GameConfigScope) → import trực tiếp từ @megawin/game-core/entities.
 *
 * Mega 6/45 là trò chơi xổ số tự chọn, chọn 6 số từ tập {01..45}.
 * KHÔNG có số đặc biệt (special/bonus) riêng.
 * 4 hạng giải: Đặc biệt (6/6 – Jackpot), Nhất (5/6), Nhì (4/6), Ba (3/6).
 */

// ─────────────────────────────────────────────
// Collection Names
// ─────────────────────────────────────────────

/** Tên các MongoDB collections cho game Mega 6/45. */
export const Mega645Collections = {
  /** Collection vé: lưu trữ thông tin vé mua. */
  Tickets: "mega645_tickets",
  /** Collection entry: 1 entry = 1 vé tham gia 1 kỳ quay cụ thể. */
  TicketEntries: "mega645_ticket_entries",
  /** Collection line: 1 line = 1 bộ 6 số (đơn vị nhỏ nhất so khớp). */
  TicketLines: "mega645_ticket_lines",
  /** Collection kỳ quay: 1 document = 1 kỳ mở thưởng. */
  Draws: "mega645_draws",
  /** Collection cấu hình game (global + tenant). */
  GameConfigs: "mega645_game_configs",
  /** Collection chu kỳ Jackpot: theo dõi tích luỹ & chia Jackpot. */
  JackpotCycles: "mega645_jackpot_cycles",
} as const;

// ─────────────────────────────────────────────
// Prize Tier
// ─────────────────────────────────────────────

/**
 * 4 hạng giải thưởng Mega 6/45.
 *
 * Thứ tự ưu tiên: jackpot > tier1 > tier2 > tier3.
 * Mỗi line chỉ trúng hạng **cao nhất** phù hợp.
 *
 * | Tier     | Điều kiện   | Default VND         |
 * |----------|-------------|---------------------|
 * | jackpot  | 6/6 số     | tích luỹ (min 12 tỷ)|
 * | tier1    | 5/6 số     | 10.000.000          |
 * | tier2    | 4/6 số     | 300.000             |
 * | tier3    | 3/6 số     | 30.000              |
 */
export const PrizeTier = {
  Jackpot: "jackpot",
  Tier1: "tier1",
  Tier2: "tier2",
  Tier3: "tier3",
} as const;

export type PrizeTier = (typeof PrizeTier)[keyof typeof PrizeTier];

export const MEGA645_PRIZE_TIER_VALUES = Object.values(PrizeTier);

/**
 * Các tier tham gia chia Jackpot khi split cycle.
 * tier1 nhận 2/5, tier2 nhận 2/5, tier3 nhận 1/5.
 */
export const MEGA645_SPLIT_ELIGIBLE_TIERS: readonly PrizeTier[] = [
  PrizeTier.Tier1,
  PrizeTier.Tier2,
  PrizeTier.Tier3,
];

// ─────────────────────────────────────────────
// Play Type
// ─────────────────────────────────────────────

/**
 * Kiểu chơi trên mỗi board.
 *
 * Mega 6/45 KHÔNG có số đặc biệt → chỉ có bao số chính.
 *
 * | Type      | Chọn             | Số lines                            |
 * |-----------|------------------|-------------------------------------|
 * | standard  | 6 số             | 1                                   |
 * | bao5      | 5 số (HT bổ sung)| C(45-5, 1) = 40 lines              |
 * | bao7      | 7 số             | C(7,6) = 7                          |
 * | bao8      | 8 số             | C(8,6) = 28                         |
 * | bao9      | 9 số             | C(9,6) = 84                         |
 * | bao10     | 10 số            | C(10,6) = 210                       |
 * | bao11     | 11 số            | C(11,6) = 462                       |
 * | bao12     | 12 số            | C(12,6) = 924                       |
 * | bao13     | 13 số            | C(13,6) = 1,716                     |
 * | bao14     | 14 số            | C(14,6) = 3,003                     |
 * | bao15     | 15 số            | C(15,6) = 5,005                     |
 * | bao18     | 18 số            | C(18,6) = 18,564                    |
 */
export const PlayType = {
  Standard: "standard",
  Bao5: "bao5",
  Bao7: "bao7",
  Bao8: "bao8",
  Bao9: "bao9",
  Bao10: "bao10",
  Bao11: "bao11",
  Bao12: "bao12",
  Bao13: "bao13",
  Bao14: "bao14",
  Bao15: "bao15",
  Bao18: "bao18",
} as const;

export type PlayType = (typeof PlayType)[keyof typeof PlayType];

export const MEGA645_PLAY_TYPE_VALUES = Object.values(PlayType);

// ─────────────────────────────────────────────
// Payout Status
// ─────────────────────────────────────────────

/**
 * Trạng thái gửi tiền trả thưởng cho tenant.
 * Flow: pending → dispatched → confirmed
 *                 ↘ failed → (retry) → dispatched
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
 * Trạng thái hoàn tiền khi entry bị void.
 * Flow: pending → dispatched → confirmed
 *                 ↘ failed → (retry) → dispatched
 */
export const RefundStatus = {
  Pending: "pending",
  Dispatched: "dispatched",
  Confirmed: "confirmed",
  Failed: "failed",
} as const;

export type RefundStatus = (typeof RefundStatus)[keyof typeof RefundStatus];
