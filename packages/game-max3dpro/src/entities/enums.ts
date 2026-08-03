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
  Tickets: "max3dpro_tickets",
  TicketEntries: "max3dpro_ticket_entries",
  TicketLines: "max3dpro_ticket_lines",
  Draws: "max3dpro_draws",
  GameConfigs: "max3dpro_game_configs",
  /** Pre-aggregated ops stats — 1 doc/draw, worker cập nhật async (ops p0-02). */
  BettingStats: "max3dpro_draw_betting_stats",
  /**
   * Chi tiết cược per-cặp ORDERED — 1 doc/(draw × pairKey). Tách khỏi BettingStats để doc
   * chính không phình theo không gian 10⁶ ordered pairs và `topPairs` không drift (p0-01 §1).
   */
  PairStats: "max3dpro_draw_pair_stats",
  /**
   * Chi tiết 1 account cược 1 cặp ORDERED — 1 doc/(draw × pairKey × accountId). Nguồn đếm
   * `accountCount` distinct cho `pair_stats` mà không phình mảng người chơi (p0-01 §1).
   */
  PairAccounts: "max3dpro_draw_pair_accounts",
  /**
   * Chi tiết cược per-account — 1 doc/(draw × accountId). Nguồn CHÍNH XÁC cho `topAccounts`
   * (thay mảng top-K in-doc bị drift theo metric tích luỹ — p0-01 §1).
   */
  AccountStats: "max3dpro_draw_account_stats",
  /** Alert vận hành — evaluator sinh trong stats worker (ops p0-04). */
  OpsAlerts: "max3dpro_ops_alerts",
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
  /**
   * Chơi bao bộ ba số: chọn 3 chữ số đầu + 3 chữ số sau, hệ thống expand.
   * Lưu ý: tất cả hoán vị front × tất cả hoán vị back (Cartesian product, tự nhiên ordered)
   * Ví dụ: ["123","456"] → 36 ordered pairs:
   *     (123,456), (123,645), (123,564), (123,465), (123,546), (123,654),
   *     (456,123), (456,321), (456,213), (456,132), (456,312), (456,231) .....
   */
  MultiDigit: "multiDigit",

  /**
   * Chơi bao nhiều bộ số: chọn 3-20 bộ ba số, hệ thống tạo P(n,2) = n×(n-1) ordered pairs.
   * Lưu ý: P(n,2) = n×(n-1) ordered pairs — thứ tự quan trọng — Giải ĐB khớp đúng thứ tự, phụ ĐB ngược thứ tự.
   * Ví dụ: ["096","389","683"] → 6 ordered pairs:
   *     (096,389), (096,683), (389,096), (389,683), (683,096), (683,389)
   */
  MultiNumber: "multiNumber",
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
 */
export const PlayType = {
  Straight: "straight",
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
// Basic Tier – Nhóm kết quả quay (ĐB / Nhất / Nhì / Ba)
// ─────────────────────────────────────────────

/**
 * Các nhóm kết quả quay thưởng cơ bản (4 nhóm tương ứng 4 lần quay).
 *
 * Dùng để phân loại 20 bộ ba số kết quả quay vào 4 nhóm:
 * - `special`: 2 bộ ba Giải Đặc Biệt
 * - `first`: 4 bộ ba Giải Nhất
 * - `second`: 6 bộ ba Giải Nhì
 * - `third`: 8 bộ ba Giải Ba
 *
 * Khác với `PrizeTier` (8 hạng giải thưởng), `BasicTier` chỉ đại diện cho
 * 4 nhóm kết quả quay — dùng trong `flattenDrawResult()`, `findTierInResult()`.
 */
export const BasicTier = {
  Special: "special",
  First: "first",
  Second: "second",
  Third: "third",
} as const;

export type BasicTier = (typeof BasicTier)[keyof typeof BasicTier];

/**
 * Thứ tự ưu tiên hạng giải cơ bản (ĐB > Nhất > Nhì > Ba).
 *
 * Khai báo module-level để tránh khởi tạo lại mỗi lần gọi match functions.
 * Settle loop gọi hàng trăm nghìn lần — tiết kiệm allocation.
 */
export const BASIC_TIER_PRIORITY: readonly BasicTier[] = [
  BasicTier.Special,
  BasicTier.First,
  BasicTier.Second,
  BasicTier.Third,
] as const;
