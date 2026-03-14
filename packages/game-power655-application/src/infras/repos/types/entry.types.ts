import type { TicketEntryEntity } from "@megawin/game-power655/entities";

/**
 * Aggregate players cho 1 draw × 1 tenant. Drill cấp 3.
 * Kết quả của $group by accountId.
 * Power 6/55: CÓ lineCount.
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
 * Alias cho TicketEntryEntity sau khi qua mapper — dùng làm output cho ListEntryBreakdownOutput.
 * Power 6/55 dùng TicketEntryEntity được định nghĩa ở entity package (có `id: string`, không có `_id`).
 */
export type EntryEntity = TicketEntryEntity;
