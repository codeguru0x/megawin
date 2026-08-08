"use client";

import { useState } from "react";

import type { WorkerHealthRow } from "@megawin/worker-core/use-cases/admin/types";
import { AlertCircle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { useSetWorkerEnabled, useWorkersHealth } from "../_lib/use-queries";
import { StalledItemsDialog } from "./stalled-items-dialog";
import { WorkerToggleDialog } from "./worker-toggle-dialog";
import { WorkersTable } from "./workers-table";

/**
 * Trang chính "Sức khoẻ worker" — tổ hợp table + confirm dialog toggle + dialog
 * chi tiết `stalledItems`.
 *
 * State dialog giữ ở đây (orchestrator), theo tiền lệ `dispatch-content.tsx`
 * (`cancelTx`) — 1 dialog dùng chung cho mọi dòng, không render 1 dialog/dòng.
 */
export function WorkersContent() {
  const query = useWorkersHealth();
  const rows = query.data ?? [];

  const [pendingToggle, setPendingToggle] = useState<WorkerHealthRow | null>(null);
  const [stalledDetail, setStalledDetail] = useState<WorkerHealthRow | null>(null);
  const toggleMutation = useSetWorkerEnabled();

  if (query.isError) {
    return (
      <Card>
        <CardContent className="flex h-60 flex-col items-center justify-center gap-3 text-center">
          <AlertCircle className="size-8 text-destructive/60" />
          <p className="text-sm font-medium text-muted-foreground">Không tải được trạng thái worker.</p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            <RefreshCw className="size-3.5" />
            Thử lại
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw className={cn("size-3.5", query.isFetching && "animate-spin")} />
          Làm mới
        </Button>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="px-0 pb-0 pt-0">
          <WorkersTable
            rows={rows}
            isLoading={query.isLoading}
            isFetching={query.isFetching}
            isToggling={toggleMutation.isPending}
            onRequestToggle={setPendingToggle}
            onOpenStalledItems={setStalledDetail}
          />
        </CardContent>
      </Card>

      <WorkerToggleDialog row={pendingToggle} onClose={() => setPendingToggle(null)} mutation={toggleMutation} />
      <StalledItemsDialog row={stalledDetail} onClose={() => setStalledDetail(null)} />
    </div>
  );
}
