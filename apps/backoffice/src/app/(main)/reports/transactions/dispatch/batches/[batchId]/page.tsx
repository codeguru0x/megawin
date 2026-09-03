"use client";

import { use, useMemo, useState } from "react";

import Link from "next/link";

import { displayVNDateTime } from "@megawin/shared/utils/date";
import { formatNumber } from "@megawin/shared/utils/number";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, CheckCircle2, Clock, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SYSTEM_ICON_GRADIENT } from "@/lib/game-colors";
import { cn } from "@/lib/utils";

import { DispatchCancelDialog } from "../../_components/dispatch-cancel-dialog";
import { DispatchDetailDrawer } from "../../_components/dispatch-detail-drawer";
import { DispatchTable } from "../../_components/dispatch-table";
import { useDispatchFilters } from "../../_lib/use-filters";
import { useBatchProgress, useDispatchList } from "../../_lib/use-queries";

/**
 * Sub-page `/reports/transactions/dispatch/batches/[batchKey]`.
 *
 * Tất cả orders cùng batchKey (1 nguồn: keno:settle:<drawId>:payout,...).
 * KPI progress card polling 30s, list scoped theo batchKey.
 */
export default function DispatchBatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = use(params);
  const batchKey = decodeURIComponent(batchId);

  const f = useDispatchFilters();
  const [cancelTx, setCancelTx] = useState<string | null>(null);

  const { data: progress, isLoading: progressLoading } = useBatchProgress(batchKey);
  const listQuery = useDispatchList({
    batchKey,
    from: f.from,
    to: f.to,
    status: f.status,
    retryMode: f.retryMode,
  });

  const rows = useMemo(() => listQuery.data?.pages.flatMap((p) => p.data) ?? [], [listQuery.data]);

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-2">
        <Button asChild size="sm" variant="ghost" className="h-7 w-fit gap-1 px-2 text-xs">
          <Link prefetch={false} href="/reports/transactions/dispatch">
            <ArrowLeft className="size-3.5" />
            Quay về Nhật ký Dispatch
          </Link>
        </Button>

        <div className="flex items-center gap-3">
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${SYSTEM_ICON_GRADIENT} shadow-sm`}
          >
            <Send className="size-4.5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Tiến độ batch</h1>
            <p className="break-all font-mono text-xs text-muted-foreground">{batchKey}</p>
          </div>
        </div>
      </div>

      <BatchProgressCard data={progress ?? null} isLoading={progressLoading} />

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
            hideBatchColumn
          />
        </CardContent>
      </Card>

      <DispatchDetailDrawer tx={f.detail || null} onClose={f.closeDetail} onRequestCancel={(tx) => setCancelTx(tx)} />

      <DispatchCancelDialog
        tx={cancelTx}
        onClose={() => setCancelTx(null)}
        onSuccess={() => void listQuery.refetch()}
      />
    </div>
  );
}

interface BatchProgress {
  batchKey: string;
  total: number;
  pending: number;
  dispatched: number;
  cancelled: number;
  firstCreatedAt?: Date | string;
  lastDispatchedAt?: Date | string;
  dispatchedAmount: number;
}

function BatchProgressCard({ data, isLoading }: { data: BatchProgress | null; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Skeleton className="h-23" />
        <Skeleton className="h-23" />
        <Skeleton className="h-23" />
        <Skeleton className="h-23" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="flex h-30 items-center justify-center text-sm text-muted-foreground">
          Không có dữ liệu batch.
        </CardContent>
      </Card>
    );
  }

  const pct = data.total > 0 ? Math.round((data.dispatched / data.total) * 100) : 0;
  const isComplete = data.total > 0 && data.pending === 0;
  const hasStarted = data.dispatched > 0;

  // Tính duration batch (từ firstCreatedAt → lastDispatchedAt). Chỉ dùng khi
  // batch đã complete và có đủ 2 timestamp.
  let durationLabel: string | null = null;
  if (isComplete && data.firstCreatedAt && data.lastDispatchedAt) {
    const startMs = new Date(data.firstCreatedAt).getTime();
    const endMs = new Date(data.lastDispatchedAt).getTime();
    const seconds = Math.max(0, Math.round((endMs - startMs) / 1000));
    if (seconds < 60) {
      durationLabel = `${seconds} giây`;
    } else if (seconds < 3600) {
      durationLabel = `${Math.round(seconds / 60)} phút`;
    } else {
      const h = Math.floor(seconds / 3600);
      const m = Math.round((seconds % 3600) / 60);
      durationLabel = m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        icon={Send}
        iconBg="bg-indigo-100 dark:bg-indigo-900/50"
        iconColor="text-indigo-600 dark:text-indigo-400"
        label="Tổng orders"
        value={formatNumber(data.total)}
        sub={data.firstCreatedAt ? `Từ ${displayVNDateTime(data.firstCreatedAt)}` : "—"}
      />
      <KpiCard
        icon={Clock}
        iconBg="bg-amber-100 dark:bg-amber-900/50"
        iconColor="text-amber-600 dark:text-amber-400"
        label="Đang chờ"
        value={formatNumber(data.pending)}
        valueClass={data.pending > 0 ? "text-warning" : ""}
        dim={data.pending === 0}
        sub={`${data.total ? Math.round((data.pending / data.total) * 100) : 0}% trong batch`}
      />
      <KpiCard
        icon={CheckCircle2}
        iconBg="bg-emerald-100 dark:bg-emerald-900/50"
        iconColor="text-emerald-600 dark:text-emerald-400"
        label="Đã dispatched"
        value={formatNumber(data.dispatched)}
        valueClass={data.dispatched > 0 ? "text-profit" : ""}
        dim={data.dispatched === 0}
        sub={`${pct}% hoàn tất · ${formatNumber(data.dispatchedAmount)}`}
      />
      {/* KPI #4 contextual: completed → duration; running → last dispatch; not started → placeholder */}
      {isComplete ? (
        <KpiCard
          icon={CheckCircle2}
          iconBg="bg-emerald-100 dark:bg-emerald-900/50"
          iconColor="text-emerald-600 dark:text-emerald-400"
          label="Thời gian hoàn tất"
          value={durationLabel ?? "—"}
          valueClass="text-profit"
          sub={data.cancelled > 0 ? `${formatNumber(data.cancelled)} đã huỷ` : "Toàn bộ đã dispatch"}
        />
      ) : hasStarted ? (
        <KpiCard
          icon={Loader2}
          iconBg="bg-amber-100 dark:bg-amber-900/50"
          iconColor="text-amber-600 dark:text-amber-400"
          iconSpin
          label="Dispatch gần nhất"
          value={data.lastDispatchedAt ? displayVNDateTime(data.lastDispatchedAt) : "—"}
          valueSmall
          sub={data.cancelled > 0 ? `${formatNumber(data.cancelled)} đã huỷ` : "Đang xử lý các order còn lại"}
        />
      ) : (
        <KpiCard
          icon={Clock}
          iconBg="bg-muted"
          iconColor="text-muted-foreground"
          label="Trạng thái"
          value="Chưa bắt đầu"
          dim
          sub="Worker chưa pick được order nào"
        />
      )}
    </div>
  );
}

interface KpiCardProps {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  /** Icon có animate-spin (cho Loader2). */
  iconSpin?: boolean;
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
  /** Hiển thị value ở font nhỏ hơn (dùng cho timestamp dài). */
  valueSmall?: boolean;
  /** Dim card khi value = 0 hoặc trạng thái không active. */
  dim?: boolean;
}

function KpiCard({
  icon: Icon,
  iconBg,
  iconColor,
  iconSpin,
  label,
  value,
  sub,
  valueClass,
  valueSmall,
  dim,
}: KpiCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg, dim && "opacity-50")}>
        <Icon className={cn("size-5", iconColor, iconSpin && "animate-spin")} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p
          className={cn(
            "font-bold tabular-nums text-foreground",
            valueSmall ? "font-mono text-sm" : "text-lg",
            dim && "text-muted-foreground",
            valueClass,
          )}
        >
          {value}
        </p>
        <p className="truncate text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}
