"use client";

import { Card, CardContent } from "@/components/ui/card";

import { AuditLogsTable } from "@/app/(main)/audit-logs/_components/audit-logs-table";
import { AuditLogDetailSheet } from "@/app/(main)/audit-logs/_components/audit-log-detail-sheet";

import { useMyActivityFilters } from "../_lib/use-filters";
import { useMyAuditLogList, useMyAuditLogDetail } from "../_lib/use-queries";
import { MyActivityFilterBar } from "./my-activity-filter-bar";

/**
 * Nội dung trang "Nhật ký của tôi" — tổ hợp filter + table + drawer chi tiết.
 *
 * Reuse trực tiếp `AuditLogsTable` + `AuditLogDetailSheet` của trang admin (không
 * fork UI). Khác biệt: filter bar chỉ 3 chiều security (date/action/status) và
 * query gọi `/me/audit-logs` self-scoped — chỉ trả nhóm action bảo mật (auth/
 * account) mà user là actor hoặc target, qua {@link useMyAuditLogList}.
 */
export function MyActivityContent() {
  const {
    from,
    to,
    action,
    status,
    cursor,
    page,
    detail,
    goNext,
    goPrev,
    openDetail,
    closeDetail,
  } = useMyActivityFilters();

  const query = useMyAuditLogList(
    {
      from,
      to,
      action: action || undefined,
      status: status ?? undefined,
    },
    cursor || null,
  );

  const rows = query.data?.data ?? [];
  const nextCursor = query.data?.nextCursor ?? null;

  const detailQuery = useMyAuditLogDetail(detail || null);

  return (
    <div className="flex flex-col gap-4">
      <MyActivityFilterBar />

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
