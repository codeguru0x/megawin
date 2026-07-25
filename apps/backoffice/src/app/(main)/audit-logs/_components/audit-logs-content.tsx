"use client";

import { Card, CardContent } from "@/components/ui/card";

import { useAuditLogFilters } from "../_lib/use-filters";
import { useAuditLogDetail, useAuditLogList } from "../_lib/use-queries";
import { AuditLogDetailSheet } from "./audit-log-detail-sheet";
import { AuditLogsFilterBar } from "./audit-logs-filter-bar";
import { AuditLogsTable } from "./audit-logs-table";

/**
 * Trang chính "Lịch sử thao tác" — tổ hợp filter + table + drawer chi tiết.
 *
 * 1. `useAuditLogFilters` đọc URL state (nuqs) → điều khiển query.
 * 2. `useAuditLogList` gọi API với filter hiện tại → infinite scroll pages.
 * 3. Row click → set `detail` URL state → `AuditLogDetailSheet` auto fetch.
 */
export function AuditLogsContent() {
  const {
    from,
    to,
    actor,
    actorType,
    game,
    category,
    action,
    targetType,
    targetId,
    status,
    cursor,
    page,
    detail,
    goNext,
    goPrev,
    openDetail,
    closeDetail,
  } = useAuditLogFilters();

  const query = useAuditLogList(
    {
      from,
      to,
      actor: actor || undefined,
      actorType: actorType ?? undefined,
      game: game || undefined,
      category: category ?? undefined,
      action: action || undefined,
      targetType: targetType ?? undefined,
      targetId: targetId || undefined,
      status: status ?? undefined,
    },
    cursor || null,
  );

  const rows = query.data?.data ?? [];
  const nextCursor = query.data?.nextCursor ?? null;

  const detailQuery = useAuditLogDetail(detail || null);

  return (
    <div className="flex flex-col gap-4">
      <AuditLogsFilterBar />

      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="px-0 pb-0 pt-0">
          <AuditLogsTable
            rows={rows}
            isLoading={query.isLoading}
            isFetching={query.isFetching}
            pageIndex={page - 1}
            hasPrev={page > 1}
            hasNext={!!nextCursor}
            onPrev={goPrev}
            onNext={() => nextCursor && goNext(nextCursor)}
            onOpenDetail={openDetail}
          />
        </CardContent>
      </Card>

      <AuditLogDetailSheet id={detail || null} onClose={closeDetail} query={detailQuery} />
    </div>
  );
}
