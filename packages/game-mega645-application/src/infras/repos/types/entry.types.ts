import type { TicketEntryEntity } from "@megawin/game-mega645/entities";

/**
 * Aggregate players cho 1 draw × 1 tenant. Drill cấp 3.
 * Mega 6/45: CÓ lineCount.
 */
export interface PlayerBreakdownRow {
  accountId: string;
  username: string;
  entryCount: number;
  lineCount: number;
  totalStake: number;
  totalWin: number;
  totalPayout: number;
}

/**
 * Alias cho TicketEntryEntity — dùng làm output cho ListEntryBreakdownOutput.
 * Được định nghĩa tại entity package để đảm bảo portable type name.
 */
export type EntryEntity = TicketEntryEntity;
