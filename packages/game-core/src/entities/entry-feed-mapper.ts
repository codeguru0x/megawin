/**
 * Game Core – Game Entry Feed Mapper Interface
 *
 * Mỗi game implement interface này để map từ entry riêng của game
 * sang EntryFeedDoc chung. Worker (Lambda) của mỗi game sẽ dùng mapper
 * tương ứng khi copy data sang collection `entryFeed`.
 *
 * Ví dụ:
 * - Lotto535EntryFeedMapper: map Lotto535TicketEntryDoc → EntryFeedDoc
 * - KenoEntryFeedMapper: map KenoTicketEntryDoc → EntryFeedDoc
 *
 * Worker flow:
 * 1. Đọc entries đã thay đổi từ game collection (theo updatedAt hoặc flag).
 * 2. Allocate batch version từ EntryChangeSeqRepository.
 * 3. Dùng mapper.toFeedDoc(entry, version) để convert mỗi entry.
 * 4. Batch insert vào entryFeed collection.
 */

import type { EntryFeedDoc } from "./entry-feed";

/**
 * Interface mà mỗi game phải implement để tham gia unified feed.
 *
 * @template TSource - Kiểu entry doc riêng của game.
 *   Lotto535: Lotto535TicketEntryDoc
 *   Keno: KenoTicketEntryDoc
 *   Max3d: (tương lai)
 */
export interface GameEntryFeedMapper<TSource> {
  /**
   * Map 1 entry của game sang EntryFeedDoc chung.
   *
   * Trách nhiệm của mapper:
   * - Map status riêng của game → EntryStatus chung.
   * - Map financial fields: amount → stakeAmount, payout.winAmount → winAmount, ...
   * - Copy các field ownership: tenantId, playerId.
   * - Copy draw info: drawId, drawTime, drawDate.
   * - Gán version (Long) đã allocate.
   * - Set feedCreatedAt = new Date().
   *
   * @param source - Entry gốc từ collection riêng của game.
   * @param version - Sequence number đã allocate (BSON Long).
   * @returns Document sẵn sàng insert vào entryFeed collection.
   */
  toFeedDoc(source: TSource, version: EntryFeedDoc["version"]): EntryFeedDoc;
}
