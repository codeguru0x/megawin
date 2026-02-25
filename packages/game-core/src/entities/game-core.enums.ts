/**
 * Game Core – Shared Enums & Constants
 *
 * Dùng chung cho tất cả game trong hệ thống (Lotto535, Keno, Max3d, ...).
 *
 * Các enum/constant ở đây phải thoả điều kiện:
 *   - Giá trị GIỐNG NHAU giữa tất cả game.
 *   - Mỗi game import từ game-core thay vì định nghĩa lại.
 *
 * Nếu 1 game cần giá trị đặc thù (vd: Lotto535PlayType, KenoPlayType),
 * giữ lại trong package riêng của game đó.
 *
 * Collections chung:
 *   entryChangeSeq     → sequence counter dùng cho change tracking
 *   entryFeed          → unified entry feed cho tenant polling
 */

// ─────────────────────────────────────────────
// Shared Collection Names
// ─────────────────────────────────────────────

/**
 * Tên các MongoDB collections dùng chung cho game-core.
 *
 * EntryChangeSeq: chứa 1 document singleton lưu global sequence counter.
 * EntryFeed: chứa bản copy đơn cược từ tất cả game, tenant poll collection này.
 */
export const GameCoreCollections = {
  /** Collection singleton lưu giá trị sequence hiện tại. */
  EntryChangeSeq: "entryChangeSeq",
  /** Collection unified chứa feed đơn cược cho tenant polling. */
  EntryFeed: "entryFeed",
  /** Cursor per game: version cuối cùng đã sync vào entryFeed. */
  FeedSyncCursor: "feedSyncCursor",
} as const;

// ─────────────────────────────────────────────
// Game Product – mã game toàn hệ thống
// ─────────────────────────────────────────────

/**
 * Danh sách tất cả game trong hệ thống.
 *
 * Giá trị string dùng làm:
 * - Field `gameProduct` trong entryFeed (phân biệt đơn cược thuộc game nào).
 * - Filter param khi tenant poll feed theo game cụ thể.
 * - Tên collection prefix cho các game riêng (vd: lotto535Tickets, kenoDraws).
 *
 * Khi thêm game mới vào hệ thống, thêm entry vào đây.
 */
export const GameProduct = {
  /** Lotto 5/35 – chọn 5 số chính + 1 đặc biệt từ tập 1-35. */
  Lotto535: "lotto535",
  /** Keno – chọn 1-10 số từ tập 01-80, quay 20 số. */
  Keno: "keno",
  /** Max 3D – chọn 3 chữ số 000-999. */
  Max3d: "max3d",
} as const;

export type GameProduct = (typeof GameProduct)[keyof typeof GameProduct];

/** Mảng tất cả giá trị GameProduct – dùng cho Zod enum validation. */
export const GAME_PRODUCT_VALUES = Object.values(GameProduct);

// ─────────────────────────────────────────────
// Ticket Status (dùng chung cho tất cả game)
// ─────────────────────────────────────────────

/**
 * Vòng đời trạng thái của vé (ticket) – dùng chung cho mọi game.
 *
 * Flow: draft → paid → completed
 *                ↘ refunded / void
 *
 * Hệ thống **không cho phép huỷ vé** (không có "cancelled").
 */
export const TicketStatus = {
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

export type TicketStatus =
  (typeof TicketStatus)[keyof typeof TicketStatus];

export const TICKET_STATUS_VALUES = Object.values(TicketStatus);

// ─────────────────────────────────────────────
// Entry Status (dùng chung cho tất cả game)
// ─────────────────────────────────────────────

/**
 * Trạng thái đồng nhất cho entry (đơn cược tham gia 1 kỳ quay) của tất cả game.
 *
 * Flow: scheduled → active → drawn → settled
 *                               ↘ void
 *
 * Tất cả game (Lotto535, Keno, Max3d…) dùng chung enum này.
 * entryFeed cũng dùng enum này.
 *
 * Tenant dùng status để phân loại đơn cược khi build report:
 * - scheduled + active → pending stake (tiền đang chờ quay)
 * - drawn → pending settlement
 * - settled → final (xem winAmount, payoutAmount)
 * - void → bỏ qua, không tính vào report
 */
export const EntryStatus = {
  /** Đã lên lịch tham gia kỳ quay. Tiền cược đã trừ nhưng chưa khoá bán. */
  Scheduled: "scheduled",
  /** Đã khoá bán, chờ quay. Entry không thể huỷ. */
  Active: "active",
  /** Đã có kết quả quay, chờ tính thưởng (settle). */
  Drawn: "drawn",
  /** Đã tính thưởng xong (terminal). */
  Settled: "settled",
  /** Bị vô hiệu (draw void, lỗi hệ thống). Tiền cược được hoàn. */
  Void: "void",
} as const;

export type EntryStatus = (typeof EntryStatus)[keyof typeof EntryStatus];

export const ENTRY_STATUS_VALUES = Object.values(EntryStatus);

// ─────────────────────────────────────────────
// Draw Status (dùng chung cho tất cả game)
// ─────────────────────────────────────────────

/**
 * Trạng thái vận hành kỳ mở thưởng (draw) – dùng chung cho mọi game.
 *
 * Flow: scheduled → salesOpen ⇄ salesClosed → published → settling → settled
 *          ↘ void      ↘ void      ↘ void       ↘ void
 *
 * - scheduled: vừa tạo, chưa mở bán. Staff cần nhấn "Mở nhận đặt cược".
 * - Không có "drawing": kết quả được import/nhập → salesClosed chuyển thẳng published.
 */
export const DrawStatus = {
  /** Vừa tạo, chưa mở bán. Chờ staff mở nhận đặt cược. */
  Scheduled: "scheduled",
  /** Đang mở bán vé. Staff đã nhấn mở nhận đặt cược. */
  SalesOpen: "salesOpen",
  /** Đã đóng bán (trước giờ quay). Entries chuyển scheduled → active. */
  SalesClosed: "salesClosed",
  /** Đã công bố kết quả, chưa settle. */
  Published: "published",
  /** Đang tính thưởng cho tất cả entries. */
  Settling: "settling",
  /** Đã hoàn tất settle. */
  Settled: "settled",
  /** Kỳ quay bị huỷ / không hợp lệ. Entries được hoàn tiền. */
  Void: "void",
} as const;

export type DrawStatus = (typeof DrawStatus)[keyof typeof DrawStatus];

export const DRAW_STATUS_VALUES = Object.values(DrawStatus);

// ─────────────────────────────────────────────
// Draw Result Source (dùng chung cho tất cả game)
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
// Ticket Channel (dùng chung cho tất cả game)
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
// Game Config Scope (dùng chung cho tất cả game)
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
