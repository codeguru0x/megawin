/**
 * Types cho PlayerEntryRepository — drill-down entries trong Player Detail.
 *
 * Dùng cho 2 luồng:
 * - Tab "Tài chính": xem entries settled/voided trong 1 ngày × 1 game
 * - Tab "Đang chờ": xem full entry doc để hiển thị EntryDetailDialog
 */

/**
 * Summary row cho danh sách entries của 1 player trong 1 ngày × 1 game.
 *
 * Query {game}_ticket_entries WHERE { accountId, financialDate, status ∈ [settled, voided] }.
 * Dùng cho bảng drill cấp 2 tab "Tài chính" Player Detail.
 *
 * KHÔNG dùng cho outstanding (scheduled) entries — outstanding
 * dùng PlayerOutstandingEntry vì chưa có payout/result.
 */
export interface PlayerSettledEntryRow {
  /** Entry ID (ObjectId hex string). */
  entryId: string;
  /** Ticket ID liên kết. */
  ticketId: string;
  /** Ticket number hiển thị (vd: "6/45-2026-0000123"). */
  ticketNo: string;
  /** Draw ID. */
  drawId: string;
  /** Tenant ID — 1 player chỉ thuộc 1 tenant duy nhất. */
  tenantId: string;
  /** Trạng thái: "settled" | "void". */
  status: string;
  /** Kết quả: "win" | "loss" | "void" | undefined nếu chưa có. */
  outcome: string | null;
  /** Tiền cược (VND). */
  amount: number;
  /**
   * Số lines (mega645/lotto535/power655/max3d/max3dpro) hoặc
   * selections (keno/bingo18). 0 nếu không applicable.
   */
  lineCount: number;
  /** Hoa hồng đại lý snapshot lúc đặt (VND). */
  commissionAmount: number;
  /** Tiền thắng (VND) — 0 nếu thua/void/chưa settle. */
  winAmount: number;
  /** Tiền trả thưởng sau khấu trừ (VND) — 0 nếu thua/void. */
  payoutAmount: number;
  /** Thời điểm tạo entry (ISO string). */
  createdAt: string;
  /** Thời điểm settle (ISO string) — null nếu void. */
  settledAt: string | null;
}
