"use client";

import { useMemo } from "react";
import { useState } from "react";
import { DispatchOrderStatus } from "@megawin/tenant-dispatch/entities";

import { Card, CardContent } from "@/components/ui/card";

import { useDispatchFilters } from "../_lib/use-filters";
import { useDispatchList, useDispatchSummary } from "../_lib/use-queries";
import { DispatchFilterBar } from "./dispatch-filter-bar";
import { DispatchKpiStrip } from "./dispatch-kpi-strip";
import { DispatchTable } from "./dispatch-table";
import { DispatchDetailDrawer } from "./dispatch-detail-drawer";
import { DispatchCancelDialog } from "./dispatch-cancel-dialog";

/**
 * Trang chính "Lệnh gửi đại lý" — tổ hợp filter + KPI + table + drawer + cancel.
 *
 * Thứ tự:
 * 1. `useDispatchFilters` đọc URL state (nuqs).
 * 2. `useDispatchSummary` → 4 KPI cards (chỉ render range mode).
 * 3. `useDispatchList` → infinite scroll table — support cả identity mode
 *    (1 trong: tx/batchKey/accountId/username) và range mode.
 * 4. Row click → mở drawer; drawer → action "Huỷ" mở cancel dialog.
 *
 * Ở identity mode, KPI ẩn (vì toàn bộ range bị bypass — số tổng không có
 * nghĩa), nhưng table vẫn render kết quả lookup.
 */
export function DispatchContent() {
  const f = useDispatchFilters();

  const [cancelTx, setCancelTx] = useState<string | null>(null);

  const summaryQuery = useDispatchSummary({
    tenantId: f.tenantId,
    from: f.from,
    to: f.to,
  });

  const listQuery = useDispatchList({
    tx: f.tx,
    batchKey: f.batchKey,
    accountId: f.accountId,
    username: f.username,
    tenantId: f.tenantId,
    status: f.status,
    sourceKind: f.sourceKind,
    retryMode: f.retryMode,
    from: f.from,
    to: f.to,
  });

  const rows = useMemo(() => listQuery.data?.pages.flatMap((p) => p.data) ?? [], [listQuery.data]);

  // Drawer ưu tiên `detail` > `tx` identity (tx identity cũng là 1 order cụ thể).
  const drawerTx = f.detail || (f.tx ?? null);

  return (
    <div className="flex flex-col gap-4">
      <DispatchFilterBar />

      {!f.isIdentityMode && (
        <DispatchKpiStrip
          data={summaryQuery.data}
          isLoading={summaryQuery.isLoading}
          onFocusPending={() => f.setStatus(DispatchOrderStatus.Pending)}
          onFocusDispatched={() => f.setStatus(DispatchOrderStatus.Dispatched)}
          onFocusStuck={() => f.setRetryMode("stuck")}
        />
      )}

      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="px-0 pb-0 pt-0">
          <DispatchTable
            rows={rows}
            isLoading={listQuery.isLoading}
            hasNextPage={!!listQuery.hasNextPage}
            isFetchingNextPage={listQuery.isFetchingNextPage}
            fetchNextPage={listQuery.fetchNextPage}
            onOpenDetail={f.openDetail}
            onCancel={(tx) => setCancelTx(tx)}
          />
        </CardContent>
      </Card>

      <DispatchDetailDrawer
        tx={drawerTx}
        onClose={() => {
          // Đóng drawer — nếu đang ở tx identity mode, clear identity hẳn.
          if (f.tx) f.clearIdentity();
          else f.closeDetail();
        }}
        onRequestCancel={(tx) => setCancelTx(tx)}
      />

      <DispatchCancelDialog
        tx={cancelTx}
        onClose={() => setCancelTx(null)}
        onSuccess={() => {
          void listQuery.refetch();
        }}
      />
    </div>
  );
}
