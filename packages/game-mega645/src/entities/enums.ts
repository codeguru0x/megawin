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
  /**
   * Collection ledger kỳ quay trong cycle: 1 document = 1 kỳ đã settle trong 1
   * cycle. Lưu lịch sử opening/closing jackpot bất biến per-draw — single source
   * of truth cho resettle (đọc opening), DBA restore cycle, và audit tích luỹ.
   */
  JackpotCycleEntries: "mega645_jackpot_cycle_entries",

  // ── Ops & Risk Control (analysis §3.3–§3.9) ──
  /** Thống kê realtime 1 kỳ — 1 doc/draw, worker cập nhật async (thay aggregate on-demand). */
  DrawBettingStats: "mega645_draw_betting_stats",
  /** Tần suất từng số trong 1 kỳ — 1 doc/(draw × số), tách riêng để chừa đường chỉ số unbounded. */
  DrawNumberStats: "mega645_draw_number_stats",
  /** Tích luỹ cược theo account trong 1 kỳ — 1 doc/(draw × account), nguồn topAccounts. */
  DrawAccountStats: "mega645_draw_account_stats",
  /** Thống kê combo (board) trong 1 kỳ — 1 doc/(draw × combo), nguồn topCombos + combo-lookup + jackpotUnits. */
  DrawComboStats: "mega645_draw_combo_stats",
  /** Chi tiết account đã cược 1 combo — 1 doc/(draw × combo × account), tránh mảng phình trong combo doc. */
  DrawComboAccounts: "mega645_draw_combo_accounts",
  /** Alert vận hành — 1 doc/(draw × dedupeKey), evaluator upsert idempotent. */
  OpsAlerts: "mega645_ops_alerts",
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
