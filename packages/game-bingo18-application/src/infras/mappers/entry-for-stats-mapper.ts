/**
 * Bingo 18 – Entry For Stats Mapper
 *
 * Map raw doc (projection tối thiểu từ `bingo18_ticket_entries`) → `EntryForStats` —
 * dùng bởi `EntryRepository.getEntriesForStatsAfter` cho stats worker (insert-stream
 * theo watermark _id).
 *
 * KHÔNG dùng `MongoMapper` base (dành cho Doc → Entity đầy đủ 1-1) vì đây là mapping
 * từ PROJECTION (subset field) sang shape riêng cho aggregation — function thuần.
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
      playType: b.playType,
      number: b.number,
      tripleKind: b.tripleKind,
      sum: b.sum,
      bet: b.bet,
      betCount: b.betCount ?? 0,
    })),
  };
}
