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
 * - date = "YYYY-MM-DD" theo timezone Asia/Ho_Chi_Minh
 * - Field `seq` tăng monotonically bằng atomic $inc
 * - Mỗi ngày mới, document mới tự động tạo qua upsert (counter reset về 1)
 *
 * Kết hợp với game prefix → ticketNo format:
 *   "KENO-20260227-00001", "L535-20260227-00002", "KENO-20260227-00003"
 *
 * ticketNo unique trong scope account (compound index { accountId, ticketNo }
 * trên mỗi game tickets collection).
 */

import type { GameProduct } from "./game-core.enums";

// ─────────────────────────────────────────────
// Game Ticket Prefix
// ─────────────────────────────────────────────

/**
 * Mapping GameProduct → prefix viết tắt dùng trong ticketNo.
 *
 * Mỗi game có prefix ngắn gọn, unique, dễ đọc.
 * Khi thêm game mới, thêm entry vào đây.
 *
 * Ví dụ ticketNo: "KENO-20260227-00001", "L535-20260227-00002"
 */
export const GameTicketPrefix: Record<GameProduct, string> = {
  lotto535: "L535",
  power655: "P655",
  mega645: "M645",
  keno: "KENO",
  max3d: "M3D",
  max3dpro: "M3DP",
  bingo18: "B18",
} as const;

// ─────────────────────────────────────────────
// Document
// ─────────────────────────────────────────────

export interface TicketCounterDoc {
  _id: unknown;

  /** Account ID của người chơi. */
  accountId: string;

  /** Ngày (YYYY-MM-DD) theo Asia/Ho_Chi_Minh. */
  date: string;

  /** Số thứ tự hiện tại — tăng bằng atomic $inc. */
  seq: number;

  /** Thời điểm lần cuối allocate (UTC). */
  updatedAt: Date;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Build ticketNo từ GameProduct + date + counter.
 *
 * Date input ở dạng "YYYY-MM-DD", khi build sẽ tự chuyển sang "YYYYMMDD" cho gọn.
 * Phần seq luôn có tối thiểu 5 chữ số (pad leading zeros).
 * Nếu seq vượt quá 5 chữ số thì giữ nguyên.
 *
 * @param gameProduct - GameProduct value (e.g. "keno", "lotto535")
 * @param date - "2026-02-27" (YYYY-MM-DD)
 * @param seq - 1, 2, 3...
 * @returns "KENO-20260227-00001"
 */
export function buildTicketNo(
  gameProduct: GameProduct,
  date: string,
  seq: number
): string {
  const prefix = GameTicketPrefix[gameProduct];
  const compactDate = date.replace(/-/g, "");
  const paddedSeq = String(seq).padStart(5, "0");
  return `${prefix}-${compactDate}-${paddedSeq}`;
}
