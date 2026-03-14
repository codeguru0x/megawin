import type { TicketEntryEntity } from "@megawin/game-max3dpro/entities";

/**
 * Aggregate result types cho entry breakdown queries — Max 3D Pro.
 *
 * Tách riêng khỏi class repo để tránh circular imports.
 */

/**
 * Kết quả aggregate breakdown theo player trong 1 draw × tenant.
 *
 * Dùng bởi ListPlayerBreakdownUseCase để hiển thị danh sách người chơi.
 */
export interface PlayerBreakdownRow {
  accountId: string;
  username: string;
  entryCount: number;
  /** Tổng số cặp (pairs) của player trong draw × tenant. */
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
