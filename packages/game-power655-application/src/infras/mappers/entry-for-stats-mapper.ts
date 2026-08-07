/**
 * Power 6/55 – Entry For Stats Mapper
 *
 * Map raw doc (projection tối thiểu từ `power655_ticket_entries`) → `EntryForStats` —
 * dùng bởi `EntryRepository` cho các query stats worker (insert-stream watermark).
 *
 * KHÔNG dùng `MongoMapper` base (dành cho Doc → Entity đầy đủ 1-1) vì đây là mapping
 * từ PROJECTION (subset field, không phải toàn bộ `TicketEntryDoc`) sang shape riêng
 * cho aggregation — 1 function thuần, không cần class. Port từ Keno
 * (`entry-for-stats-mapper.ts`), thêm `betUnitCount` (Power655 cần cho `jackpotUnits`/
 * exposure — KHÔNG có ở Keno) và đổi `numbers`/`bet` → `mainNumbers`/`expandedLines`.
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
    betUnitCount: d.betUnitCount ?? 0,
    commission: d.tenant?.commissionAmount ?? 0,
    boards: (d.entrySummary?.boards ?? []).map((b: Document) => ({
      playType: b.playType,
      mainNumbers: b.mainNumbers ?? [],
      expandedLines: b.expandedLines ?? 0,
      betCount: b.betCount ?? 0,
    })),
  };
}
