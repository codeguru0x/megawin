import type { TicketEntryEntity } from "@megawin/game-keno/entities";

/** Keno: KHÔNG CÓ lineCount. */
export interface PlayerBreakdownRow {
  accountId: string;
  username: string;
  entryCount: number;
  totalStake: number;
  totalWin: number;
  totalPayout: number;
}

/**
 * Alias cho TicketEntryEntity — dùng làm output cho ListEntryBreakdownOutput.
 * Được định nghĩa tại entity package để đảm bảo portable type name.
 */
export type EntryEntity = TicketEntryEntity;
