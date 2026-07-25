"use client";

import { useMemo } from "react";

import { Card, CardContent } from "@/components/ui/card";

import { useTxLogFilters } from "../_lib/use-filters";
import { useTxLogList, useTxLogSummary } from "../_lib/use-queries";
import { TxLogDetailDrawer } from "./tx-log-detail-drawer";
import { TxLogFilterBar } from "./tx-log-filter-bar";
import { TxLogKpiStrip } from "./tx-log-kpi-strip";
import { TxLogTable } from "./tx-log-table";

/**
 * Trang chính "Nhật ký giao dịch" — tổ hợp filter + KPI strip + table + drawer.
 *
 * Thứ tự hoạt động:
 * 1. `useTxLogFilters` đọc URL state (nuqs) → điều khiển query.
 * 2. `useTxLogSummary` gọi summary KPI (chỉ khi có from/to, KHÔNG khi search tx).
 * 3. `useTxLogList` gọi API với filter hiện tại → infinite scroll pages.
 * 4. Row click → set `detail` URL state → `TxLogDetailDrawer` auto fetch.
 */
export function TxLogContent() {
  const { tx, from, to, status, eventType, detail, isTxMode, openDetail, closeDetail } = useTxLogFilters();

  const summaryQuery = useTxLogSummary({
    from,
    to,
    enabled: !isTxMode,
  });

  const query = useTxLogList({
    tx,
    from,
    to,
    status,
    eventType,
  });

  const rows = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);

  return (
    <div className="flex flex-col gap-4">
      <TxLogFilterBar />

      {!isTxMode && <TxLogKpiStrip data={summaryQuery.data} isLoading={summaryQuery.isLoading} />}

      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="px-0 pb-0 pt-0">
          <TxLogTable
            rows={rows}
            isLoading={query.isLoading}
            hasNextPage={!!query.hasNextPage}
            isFetchingNextPage={query.isFetchingNextPage}
            fetchNextPage={query.fetchNextPage}
            onOpenDetail={openDetail}
          />
        </CardContent>
      </Card>

      <TxLogDetailDrawer tx={detail || null} onClose={closeDetail} />
    </div>
  );
}
