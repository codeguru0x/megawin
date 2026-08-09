/**
 * Max 3D Pro – Entry For Stats Mapper
 *
 * Map raw doc (projection tối thiểu từ `max3dpro_ticket_entries`) → `EntryForStats` —
 * dùng bởi `EntryRepository.getEntriesForStatsAfter` cho stats worker.
 *
 * KHÔNG dùng `MongoMapper` base (mapping từ PROJECTION sang shape aggregation riêng).
 */

import type { Document } from "mongodb";

import type { EntryForStats } from "../repos/types";

/** Map 1 raw entry doc (projection stats) → `EntryForStats`. */
export function mapDocToEntryForStats(d: Document): EntryForStats {
  return {
    id: d._id.toHexString(),
    drawId: d.drawId,
    tenantId: d.tenantId,
    accountId: d.accountId,
    username: d.username ?? "",
    amount: d.amount ?? 0,
    unitPrice: d.unitPrice ?? 0,
    commission: d.tenant?.commissionAmount ?? 0,
    boards: (d.entrySummary?.boards ?? []).map((b: Document) => ({
      playMode: b.playMode,
      playType: b.playType,
      triplets: b.triplets ?? [],
      frontDigits: b.frontDigits,
      backDigits: b.backDigits,
      lineCount: b.lineCount ?? 1,
      // Fallback 1 cho data cũ thiếu betCount.
      betCount: b.betCount ?? 1,
    })),
  };
}
