"use client";

import { Suspense, use, useMemo, useState } from "react";

import Link from "next/link";

import { FileSearch, Package2 } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SYSTEM_ICON_GRADIENT } from "@/lib/game-colors";

import { TxLogDetailDrawer } from "../../_components/tx-log-detail-drawer";
import { TxLogTable } from "../../_components/tx-log-table";
import { useTxLogsByBatch } from "../../_lib/use-queries";

function shortId(value: string, head = 12): string {
  if (value.length <= head) return value;
  return `${value.slice(0, head)}…`;
}

function BatchPageInner({ batchId }: { batchId: string }) {
  const [detailTx, setDetailTx] = useState<string | null>(null);

  const query = useTxLogsByBatch(batchId);

  const rows = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);

  const firstRow = rows[0];
  const tenantId = firstRow?.tenantId;
  const firstCreatedAt = firstRow?.createdAt;

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/reports/transactions/api-logs">Nhật ký giao dịch</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-mono">Batch {shortId(batchId)}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${SYSTEM_ICON_GRADIENT} shadow-sm`}
        >
          <Package2 className="size-4.5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Chi tiết batch</h1>
          <p className="text-xs text-muted-foreground">
            Tất cả items cùng <span className="font-mono">batchId</span>.
          </p>
        </div>
      </div>

      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pb-2 pt-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <FileSearch className="size-4 text-muted-foreground" />
            Thông tin batch
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 pb-4 pt-0 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Batch ID">
            <span className="break-all font-mono text-xs">{batchId}</span>
          </Metric>
          <Metric label="Tenant">
            <span className="font-mono text-xs">{tenantId ?? (query.isLoading ? "…" : "—")}</span>
          </Metric>
          <Metric label="Số items (đã load)">
            <span className="font-mono text-xs tabular-nums">
              {rows.length}
              {query.hasNextPage ? "+" : ""}
            </span>
          </Metric>
          <Metric label="Item đầu tiên">
            <span className="font-mono text-xs tabular-nums">
              {firstCreatedAt ? new Date(firstCreatedAt).toLocaleString("vi-VN") : query.isLoading ? "…" : "—"}
            </span>
          </Metric>
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden py-0">
        <CardContent className="px-0 pb-0 pt-0">
          <TxLogTable
            rows={rows}
            isLoading={query.isLoading}
            hasNextPage={!!query.hasNextPage}
            isFetchingNextPage={query.isFetchingNextPage}
            fetchNextPage={query.fetchNextPage}
            onOpenDetail={(tx) => setDetailTx(tx)}
            hideBatchColumn
          />
        </CardContent>
      </Card>

      <TxLogDetailDrawer tx={detailTx} onClose={() => setDetailTx(null)} />
    </div>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default function BatchTxLogPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = use(params);
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <BatchPageInner batchId={batchId} />
    </Suspense>
  );
}
