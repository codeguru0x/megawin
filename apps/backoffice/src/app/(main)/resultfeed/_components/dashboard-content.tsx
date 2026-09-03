"use client";

import Link from "next/link";

import { ConsensusState } from "@megawin/resultfeed/entities";
import { formatNumber } from "@megawin/shared/utils";
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, RefreshCw, ShieldCheck, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { ALERT_SEVERITY_VARIANT, CONSENSUS_STATE_LABELS, RESULTFEED_GAME_LABELS } from "../_lib/labels";
import { useAlerts, useDashboardStats } from "../_lib/use-queries";

/** Thứ tự cột state cố định — Conflict đặt gần đầu vì đây là thứ vận hành cần quan tâm nhất. */
const STATE_COLUMNS = [
  ConsensusState.Conflict,
  ConsensusState.Pending,
  ConsensusState.Agreed,
  ConsensusState.HumanVerified,
  ConsensusState.Rejected,
];

/** Icon + màu + sub-text cho từng state — dùng cho KPI strip (mục 1.2a `frontend-dev.mdc`). */
const STATE_KPI_STYLES: Record<
  ConsensusState,
  { icon: React.ComponentType<{ className?: string }>; iconBg: string; iconColor: string; sub: string }
> = {
  [ConsensusState.Conflict]: {
    icon: AlertTriangle,
    iconBg: "bg-rose-100 dark:bg-rose-900/50",
    iconColor: "text-rose-600 dark:text-rose-400",
    sub: "Cần xử lý ngay",
  },
  [ConsensusState.Pending]: {
    icon: Clock,
    iconBg: "bg-amber-100 dark:bg-amber-900/50",
    iconColor: "text-amber-600 dark:text-amber-400",
    sub: "Đang chờ nguồn",
  },
  [ConsensusState.Agreed]: {
    icon: CheckCircle2,
    iconBg: "bg-emerald-100 dark:bg-emerald-900/50",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    sub: "Các nguồn tự khớp",
  },
  [ConsensusState.HumanVerified]: {
    icon: ShieldCheck,
    iconBg: "bg-blue-100 dark:bg-blue-900/50",
    iconColor: "text-blue-600 dark:text-blue-400",
    sub: "Người đã xác nhận",
  },
  [ConsensusState.Rejected]: {
    icon: XCircle,
    iconBg: "bg-slate-100 dark:bg-slate-800",
    iconColor: "text-slate-600 dark:text-slate-400",
    sub: "Không hợp lệ",
  },
};

/** KPI card cho 1 consensus state — pattern icon horizontal chuẩn (mục 1.2a `frontend-dev.mdc`). */
function StateKpiCard({ state, count }: { state: ConsensusState; count: number }) {
  const isConflict = state === ConsensusState.Conflict;
  const { icon: Icon, iconBg, iconColor, sub } = STATE_KPI_STYLES[state];
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{CONSENSUS_STATE_LABELS[state]}</p>
        <p
          className={cn(
            "text-lg font-bold tabular-nums text-foreground",
            isConflict && count > 0 && "text-rose-600 dark:text-rose-400",
          )}
        >
          {formatNumber(count)}
        </p>
        <p className="truncate text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

/**
 * Trang chính "ResultFeed Dashboard" — snapshot đếm consensus theo state (toàn cục + theo
 * game) + hàng đợi alert mới chưa xử lý.
 */
export function DashboardContent() {
  const statsQuery = useDashboardStats();
  const alertsQuery = useAlerts("new");

  if (statsQuery.isError) {
    return (
      <Card>
        <CardContent className="flex h-60 flex-col items-center justify-center gap-3 text-center">
          <AlertCircle className="size-8 text-destructive/60" />
          <p className="font-medium text-muted-foreground text-sm">Không tải được dữ liệu tổng quan.</p>
          <Button variant="outline" size="sm" onClick={() => statsQuery.refetch()}>
            <RefreshCw className="size-3.5" />
            Thử lại
          </Button>
        </CardContent>
      </Card>
    );
  }

  const stats = statsQuery.data;
  const alerts = alertsQuery.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => statsQuery.refetch()}
          disabled={statsQuery.isFetching}
        >
          <RefreshCw className={cn("size-3.5", statsQuery.isFetching && "animate-spin")} />
          Làm mới
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STATE_COLUMNS.map((state) => (
          <StateKpiCard key={state} state={state} count={stats?.totalByState[state] ?? 0} />
        ))}
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b px-5 py-4">
          <CardTitle className="font-semibold text-sm">Theo từng game</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pt-0 pb-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Game</TableHead>
                  {STATE_COLUMNS.map((state) => (
                    <TableHead key={state} className="text-right">
                      {CONSENSUS_STATE_LABELS[state]}
                    </TableHead>
                  ))}
                  <TableHead className="w-10 pr-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(RESULTFEED_GAME_LABELS).map(([gameKey, label]) => {
                  const byGame = stats?.byGame[gameKey as keyof typeof RESULTFEED_GAME_LABELS];
                  const conflictCount = byGame?.[ConsensusState.Conflict] ?? 0;
                  return (
                    <TableRow key={gameKey}>
                      <TableCell className="pl-5 font-medium">{label}</TableCell>
                      {STATE_COLUMNS.map((state) => (
                        <TableCell
                          key={state}
                          className={cn(
                            "text-right tabular-nums",
                            state === ConsensusState.Conflict && (byGame?.[state] ?? 0) > 0 && "text-destructive",
                          )}
                        >
                          {formatNumber(byGame?.[state] ?? 0)}
                        </TableCell>
                      ))}
                      <TableCell className="pr-5 text-right">
                        {conflictCount > 0 && (
                          <Link prefetch={false} href={`/resultfeed/review?gameKey=${gameKey}`}>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                              Xem
                            </Button>
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-500" />
            <CardTitle className="font-semibold text-sm">Alert mới ({alerts.length})</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-5 py-4">
          {alerts.length === 0 ? (
            <p className="text-muted-foreground text-sm">Không có alert nào đang chờ xử lý.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {alerts.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-sm">{alert.type}</span>
                    <span className="text-muted-foreground text-xs">{alert.dedupeKey}</span>
                  </div>
                  <Badge variant={ALERT_SEVERITY_VARIANT[alert.severity]}>{alert.severity}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
