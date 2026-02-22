/**
 * Lotto 5/35 – Enums & Constants
 *
 * Quy ước đặt tên cho tất cả game trong hệ thống:
 *   {Game}{Concept} – ví dụ: Lotto535TicketStatus, KenoTicketStatus, Max3dTicketStatus
 *
 * Dùng **const object pattern** (giống TenantStatus, AccountType trong identity-domain)
 * để vừa có runtime values vừa có type safety.
 *
 * Collections MongoDB tương ứng (pattern chung cho mọi game):
 *   {game}Tickets          → lotto535Tickets
 *   {game}TicketEntries    → lotto535TicketEntries
 *   {game}TicketLines      → lotto535TicketLines
 *   {game}Draws            → lotto535Draws
 *   {game}GameConfigs      → lotto535GameConfigs
 */

// ─────────────────────────────────────────────
// Collection Names (dùng ở repository layer)
// ─────────────────────────────────────────────

/** Tên các MongoDB collections cho game Lotto 5/35. */
export const Lotto535Collections = {
  Tickets: "lotto535Tickets",
  TicketEntries: "lotto535TicketEntries",
  TicketLines: "lotto535TicketLines",
  Draws: "lotto535Draws",
  GameConfigs: "lotto535GameConfigs",
} as const;

// ─────────────────────────────────────────────
// Product Identifier
// ─────────────────────────────────────────────

/** Mã sản phẩm game – dùng để phân biệt trong hệ thống multi-game. */
export const Lotto535Product = "lotto535" as const;
export type Lotto535Product = typeof Lotto535Product;

// ─────────────────────────────────────────────
// Currency
// ─────────────────────────────────────────────

/** Đơn vị tiền tệ. Hiện tại chỉ hỗ trợ VND. */
export const Currency = {
  VND: "VND",
} as const;

export type Currency = (typeof Currency)[keyof typeof Currency];

// ─────────────────────────────────────────────
// Ticket Status
// ─────────────────────────────────────────────

/**
 * Vòng đời trạng thái của vé (ticket).
 *
 * Flow: draft → paid → completed
 *                ↘ refunded / void
 *
 * LƯU Ý: Hệ thống **không cho phép huỷ vé** (không có "cancelled").
 */
export const Lotto535TicketStatus = {
  /** Vé nháp, chưa thanh toán – có thể chỉnh sửa boards/plan. */
  Draft: "draft",
  /** Đã thanh toán – vé bị khoá (immutable), entries được tạo. */
  Paid: "paid",
  /** Đã hoàn tiền – chỉ xảy ra khi có lỗi hệ thống hoặc kỳ quay bị void. */
  Refunded: "refunded",
  /** Vô hiệu – gian lận, lỗi nghiêm trọng, admin void. */
  Void: "void",
  /** Tất cả kỳ quay đã settle xong. */
  Completed: "completed",
} as const;

export type Lotto535TicketStatus =
  (typeof Lotto535TicketStatus)[keyof typeof Lotto535TicketStatus];

export const LOTTO535_TICKET_STATUS_VALUES = Object.values(
  Lotto535TicketStatus,
);

// ─────────────────────────────────────────────
// Entry Status
// ─────────────────────────────────────────────

/**
 * Trạng thái entry (vé tham gia 1 kỳ quay cụ thể).
 *
 * Flow: scheduled → active → drawn → settled
 *                               ↘ void
 */
export const Lotto535EntryStatus = {
  /** Đã lên lịch tham gia kỳ này. */
  Scheduled: "scheduled",
  /** Đã khoá bán, chờ quay hoặc đang quay. */
  Active: "active",
  /** Đã có kết quả, chờ tính thưởng (settle). */
  Drawn: "drawn",
  /** Đã tính thưởng xong. */
  Settled: "settled",
  /** Entry bị vô hiệu (draw void, lỗi hệ thống). */
  Void: "void",
} as const;

export type Lotto535EntryStatus =
  (typeof Lotto535EntryStatus)[keyof typeof Lotto535EntryStatus];

export const LOTTO535_ENTRY_STATUS_VALUES = Object.values(
  Lotto535EntryStatus,
);

// ─────────────────────────────────────────────
// Draw Status
// ─────────────────────────────────────────────

/**
 * Trạng thái vận hành kỳ mở thưởng (draw).
 *
 * Flow: scheduled → salesOpen → salesClosed → drawing → published → settling → settled
 *                                                                              ↘ void
 */
export const Lotto535DrawStatus = {
  /** Đã tạo lịch kỳ quay. */
  Scheduled: "scheduled",
  /** Đang mở bán vé. */
  SalesOpen: "salesOpen",
  /** Đã đóng bán (30 phút trước giờ quay). */
  SalesClosed: "salesClosed",
  /** Đang quay / chờ kết quả. */
  Drawing: "drawing",
  /** Đã công bố kết quả, chưa settle. */
  Published: "published",
  /** Đang tính thưởng cho tất cả entries. */
  Settling: "settling",
  /** Đã hoàn tất settle + tính jackpot. */
  Settled: "settled",
  /** Kỳ quay bị huỷ / không hợp lệ. */
  Void: "void",
} as const;

export type Lotto535DrawStatus =
  (typeof Lotto535DrawStatus)[keyof typeof Lotto535DrawStatus];

export const LOTTO535_DRAW_STATUS_VALUES = Object.values(Lotto535DrawStatus);

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

export const LOTTO535_PRIZE_TIER_VALUES = Object.values(Lotto535PrizeTier);

/**
 * Các tier tham gia chia Jackpot khi split cycle (không bao gồm consolation).
 * tier1 nhận 2/6, tier2-tier5 mỗi tier nhận 1/6.
 */
export const LOTTO535_SPLIT_ELIGIBLE_TIERS: readonly Lotto535PrizeTier[] = [
  Lotto535PrizeTier.Tier1,
  Lotto535PrizeTier.Tier2,
  Lotto535PrizeTier.Tier3,
  Lotto535PrizeTier.Tier4,
  Lotto535PrizeTier.Tier5,
];

// ─────────────────────────────────────────────
// Play Type
// ─────────────────────────────────────────────

/**
 * Kiểu chơi trên mỗi board.
 *
 * | Type         | Chọn                        | Số lines            |
 * |--------------|-----------------------------|---------------------|
 * | standard     | 5 chính + 1 đặc biệt       | 1                   |
 * | mainCover4   | 4 chính + 1 đặc biệt       | 31 (hệ thống bổ sung) |
 * | mainCover    | 6-15 chính + 1 đặc biệt    | C(N,5)              |
 * | specialCover | 5 chính + 2-12 đặc biệt    | K                   |
 * | quickPick    | máy chọn ngẫu nhiên         | 1 (map → standard)  |
 */
export const Lotto535PlayType = {
  /** Chọn đúng 5 số chính + 1 số đặc biệt = 1 line. */
  Standard: "standard",
  /** Bao 4 số chính: chọn 4 số, hệ thống ghép 31 số còn lại = 31 lines. */
  MainCover4: "mainCover4",
  /** Bao N số chính (6-15): chọn N số + 1 đặc biệt = C(N,5) lines. */
  MainCover: "mainCover",
  /** Bao K số đặc biệt (2-12): 5 chính + K đặc biệt = K lines. */
  SpecialCover: "specialCover",
  /** Máy tự chọn ngẫu nhiên – backend map sang standard. */
  QuickPick: "quickPick",
} as const;

export type Lotto535PlayType =
  (typeof Lotto535PlayType)[keyof typeof Lotto535PlayType];

export const LOTTO535_PLAY_TYPE_VALUES = Object.values(Lotto535PlayType);

// ─────────────────────────────────────────────
// Draw Result Source
// ─────────────────────────────────────────────

/** Nguồn cung cấp kết quả kỳ quay – dùng cho audit trail. */
export const DrawResultSource = {
  /** Import tự động từ Vietlott. */
  Vietlott: "vietlott",
  /** Nhập tay bởi admin/staff trên backoffice. */
  Manual: "manual",
  /** Import batch từ file/hệ thống bên ngoài. */
  Import: "import",
} as const;

export type DrawResultSource =
  (typeof DrawResultSource)[keyof typeof DrawResultSource];

// ─────────────────────────────────────────────
// Ticket Channel
// ─────────────────────────────────────────────

/** Kênh bán vé – dùng để tracking nguồn mua. */
export const TicketChannel = {
  /** Điểm bán lẻ (point of sale). */
  Pos: "pos",
  /** Website. */
  Web: "web",
  /** Qua SDK tích hợp của tenant. */
  Sdk: "sdk",
} as const;

export type TicketChannel =
  (typeof TicketChannel)[keyof typeof TicketChannel];

// ─────────────────────────────────────────────
// Game Config Scope
// ─────────────────────────────────────────────

/** Phạm vi áp dụng cấu hình game. */
export const GameConfigScope = {
  /** Cấu hình toàn hệ thống – 1 document duy nhất. */
  Global: "global",
  /** Cấu hình riêng cho từng tenant – override global. */
  Tenant: "tenant",
} as const;

export type GameConfigScope =
  (typeof GameConfigScope)[keyof typeof GameConfigScope];

// ─────────────────────────────────────────────
// Expansion Mode
// ─────────────────────────────────────────────

/**
 * Chiến lược lưu trữ lines (bộ số con) khi bao số.
 * Quyết định khi nào expand boards → lines.
 */
export const ExpansionMode = {
  /** Không lưu lines – expand on-the-fly khi settle. Dùng khi line count nhỏ. */
  None: "none",
  /** Materialize lines ngay khi ticket paid. Dùng khi bao lớn. */
  OnWrite: "onWrite",
  /** Materialize lần đầu khi cần settle (lazy). */
  OnSettle: "onSettle",
} as const;

export type ExpansionMode =
  (typeof ExpansionMode)[keyof typeof ExpansionMode];
