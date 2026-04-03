/**
 * Types cho PlayerEntryRepository — drill-down entries trong Player Detail.
 *
 * Dùng cho 3 luồng:
 * - Tab "Tài chính" View 3: aggregate entries theo drawId trong 1 ngày × 1 game
 * - Tab "Tài chính" View 4: xem entries settled/voided trong 1 ngày × 1 game (optional drawId filter)
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
   * Số boards trong vé = `entrySummary.boards.length`.
   * Tất cả 7 game đều có. `undefined` khi data cũ không truyền vào.
   */
  boardCount?: number;
  /**
   * Số lines sau khi expand (lotto535, mega645, power655, max3d, max3dpro).
   * Keno/Bingo18: `undefined`. 0 nếu không applicable (fallback cũ).
   */
  lineCount: number;
  /**
   * Số đơn vị cược = Σ(expandedLines × betCount) cho games có lines,
   * hoặc Σ(board.betCount) cho Keno/Bingo18.
   * `undefined` khi data cũ chưa có field này.
   */
  betUnitCount?: number;
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

/**
 * Aggregate row cho View 3: breakdown theo drawId trong 1 ngày × 1 game × 1 player.
 *
 * Pipeline: $match { accountId, financialDate, gameProduct, status ∈ [settled, void] }
 *           → $group by drawId → SUM financial fields.
 */
export interface PlayerDrawBreakdownRow {
  /** Draw ID (YYYY-MM-DD.NNN). */
  drawId: string;
  /** Số entry settled + void trong kỳ quay này. */
  entryCount: number;
  /** Tổng tiền cược (VND) — chỉ entries settled. */
  totalStake: number;
  /** Tổng tiền trả thưởng (VND) — chỉ entries settled. */
  totalPayout: number;
  /** GGR = totalStake - totalPayout (VND). Có thể ÂM. */
  ggr: number;
  /** Tổng hoa hồng đại lý (VND) — chỉ entries settled. */
  totalCommission: number;
  /** Lợi nhuận ròng = ggr - totalCommission (VND). Có thể ÂM. */
  netProfit: number;
}
