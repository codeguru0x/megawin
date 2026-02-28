/**
 * Game Core – Ticket Counter
 *
 * Collection: ticket_counters
 *
 * Mục đích: cấp phát số thứ tự ticketNo cho mỗi account theo ngày.
 * Tất cả game dùng chung 1 counter per account per day.
 *
 * Cách hoạt động:
 * - Key = { accountId, date } (compound unique index)
 * - date = "YYYYMMDD" theo timezone Asia/Ho_Chi_Minh
 * - Field `seq` tăng monotonically bằng atomic $inc
 * - Mỗi ngày mới, document mới tự động tạo qua upsert (counter reset về 1)
 *
 * Kết hợp với game prefix → ticketNo format:
 *   "KENO-20260227-1", "L535-20260227-2", "KENO-20260227-3"
 *
 * ticketNo unique trong scope account (compound index { accountId, ticketNo }
 * trên mỗi game tickets collection).
 */

// ─────────────────────────────────────────────
// Document
// ─────────────────────────────────────────────

export interface TicketCounterDoc {
  _id: unknown;

  /** Account ID của người chơi. */
  accountId: string;

  /** Ngày (YYYYMMDD) theo Asia/Ho_Chi_Minh. */
  date: string;

  /** Số thứ tự hiện tại — tăng bằng atomic $inc. */
  seq: number;

  /** Thời điểm lần cuối allocate (UTC). */
  updatedAt: Date;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const VN_TZ = "Asia/Ho_Chi_Minh";

/**
 * Lấy ngày hiện tại theo timezone Asia/Ho_Chi_Minh, format YYYYMMDD.
 *
 * Dùng Intl.DateTimeFormat để tránh dependency dayjs/luxon.
 */
export function getTodayDateVN(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}${m}${d}`;
}

/**
 * Build ticketNo từ game prefix + date + counter.
 *
 * @param gamePrefix - "KENO", "L535", etc.
 * @param date - "20260227"
 * @param seq - 1, 2, 3...
 * @returns "KENO-20260227-1"
 */
export function buildTicketNo(
  gamePrefix: string,
  date: string,
  seq: number
): string {
  return `${gamePrefix}-${date}-${seq}`;
}
