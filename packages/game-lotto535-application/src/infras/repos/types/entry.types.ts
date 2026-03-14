import type { TicketEntryEntity } from "@megawin/game-lotto535/entities";

/**
 * Aggregate players cho 1 draw × 1 tenant. Drill cấp 3.
 * Kết quả của $group by accountId.
 */
export interface PlayerBreakdownRow {
  accountId: string;
  username: string;
  entryCount: number;
  lineCount: number;
  /** Tổng tiền cược (VND). */
  totalStake: number;
  /** Tổng tiền thắng (VND). */
  totalWin: number;
  /** Tổng tiền trả thưởng (VND). */
  totalPayout: number;
}

/**
 * Alias cho TicketEntryEntity — dùng làm output cho ListEntryBreakdownOutput.
 * Được định nghĩa tại entity package để đảm bảo portable type name.
 */
export type EntryEntity = TicketEntryEntity;
