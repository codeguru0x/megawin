"use client";

import {
  CircleDollarSign,
  Clock,
  Lock,
  Radio,
  Ticket,
  Timer,
  Unlock,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Power655DrawStatusBadge } from "@/components/games/power655/draw-status-badge";
import { formatVND } from "@/components/games/power655/jackpot-display";
import { DrawStatus } from "@megawin/game-core/entities";
import { formatVNTime } from "@megawin/shared/utils/date";
import type { CurrentDrawInfo } from "./use-draws";

import { OpenSalesAction } from "./actions/open-sales-action";
import { CloseSalesAction } from "./actions/close-sales-action";
import { PublishResultAction } from "./actions/publish-result-action";
import { TriggerSettleAction } from "./actions/trigger-settle-action";
import { EditScheduleAction } from "./actions/edit-schedule-action";
import { JackpotPanel } from "./jackpot-panel";
import { VoidDrawAction } from "./actions/void-draw-action";

function canOpenSales(s: string) {
  return s === DrawStatus.Scheduled || s === DrawStatus.SalesClosed;
}
function canCloseSales(s: string) {
  return s === DrawStatus.SalesOpen;
}
function canPublishResult(s: string) {
  return s === DrawStatus.SalesClosed || s === DrawStatus.Published;
}
function canTriggerSettle(s: string) {
  return s === DrawStatus.Published;
}
function canEditSchedule(s: string) {
  return s === DrawStatus.Scheduled || s === DrawStatus.SalesOpen;
}
function canVoidDraw(s: string) {
  return (
    s === DrawStatus.Scheduled ||
    s === DrawStatus.SalesClosed ||
    s === DrawStatus.Published
  );
}

const STATUS_VISUALS: Record<
  string,
  { border: string; accent: string; iconBg: string; iconColor: string }
> = {
  [DrawStatus.Scheduled]: {
    border: "border-slate-200 dark:border-slate-700",
    accent: "from-slate-400 to-slate-600",
    iconBg: "bg-slate-100 dark:bg-slate-800",
    iconColor: "text-slate-500 dark:text-slate-400",
  },
  [DrawStatus.SalesOpen]: {
    border: "border-green-200 dark:border-green-800",
    accent: "from-green-500 via-emerald-500 to-teal-500",
    iconBg: "bg-green-100 dark:bg-green-900",
    iconColor: "text-green-600 dark:text-green-400",
  },
  [DrawStatus.SalesClosed]: {
    border: "border-amber-200 dark:border-amber-800",
    accent: "from-amber-500 to-orange-500",
    iconBg: "bg-amber-100 dark:bg-amber-900",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  [DrawStatus.Published]: {
    border: "border-violet-200 dark:border-violet-800",
    accent: "from-violet-500 via-purple-500 to-fuchsia-500",
    iconBg: "bg-violet-100 dark:bg-violet-900",
    iconColor: "text-violet-600 dark:text-violet-400",
  },
  [DrawStatus.Settling]: {
    border: "border-orange-200 dark:border-orange-800",
    accent: "from-orange-500 to-red-500",
    iconBg: "bg-orange-100 dark:bg-orange-900",
    iconColor: "text-orange-600 dark:text-orange-400",
  },
  [DrawStatus.Voiding]: {
    border: "border-red-200 dark:border-red-800",
    accent: "from-red-500 to-rose-600",
    iconBg: "bg-red-100 dark:bg-red-900",
    iconColor: "text-red-600 dark:text-red-400",
  },
};

const DEFAULT_VISUAL = {
  border: "border-border",
  accent: "from-red-500 to-orange-500",
  iconBg: "bg-muted",
  iconColor: "text-muted-foreground",
};

export function Power655PrimaryDrawCard({ draw }: { draw: CurrentDrawInfo }) {
  const status = draw.status;
  const vis = STATUS_VISUALS[status] ?? DEFAULT_VISUAL;
  const drawTime = formatVNTime(new Date(draw.drawTime));

  const now = new Date();
  const closeAt = new Date(draw.sales.closeAt);
  const remainMs = Math.max(0, closeAt.getTime() - now.getTime());
  const remainMinutes = Math.floor(remainMs / 60_000);

  const showCountdown = status === DrawStatus.SalesOpen && remainMs > 0;
  const showStats =
    draw.stats &&
    (status === DrawStatus.SalesClosed ||
      status === DrawStatus.Published ||
      status === DrawStatus.Settling ||
      status === DrawStatus.Voiding ||
      status === DrawStatus.Settled);

  const isTerminal =
    status === DrawStatus.Settled ||
    status === DrawStatus.Void ||
    status === DrawStatus.Settling ||
    status === DrawStatus.Voiding;

  return (
    <Card
      className={cn(
        "relative overflow-hidden border-2 shadow-lg",
        vis.border,
        status === DrawStatus.SalesOpen &&
          "bg-linear-to-br from-green-50/80 via-white to-emerald-50/40 dark:from-green-950/30 dark:via-background dark:to-emerald-950/20 shadow-green-200/30 dark:shadow-green-900/20",
        status === DrawStatus.SalesClosed &&
          "bg-linear-to-br from-amber-50/80 via-white to-orange-50/40 dark:from-amber-950/30 dark:via-background dark:to-orange-950/20 shadow-amber-200/30 dark:shadow-amber-900/20",
        status === DrawStatus.Published &&
          "bg-linear-to-br from-violet-50/80 via-white to-purple-50/40 dark:from-violet-950/30 dark:via-background dark:to-purple-950/20 shadow-violet-200/30 dark:shadow-violet-900/20",
        status === DrawStatus.Scheduled &&
          "bg-linear-to-br from-slate-50/80 via-white to-slate-50/40 dark:from-slate-950/30 dark:via-background dark:to-slate-950/20 shadow-slate-200/30 dark:shadow-slate-900/20",
        status === DrawStatus.Settling &&
          "bg-linear-to-br from-orange-50/80 via-white to-red-50/40 dark:from-orange-950/30 dark:via-background dark:to-red-950/20 shadow-orange-200/30 dark:shadow-orange-900/20",
        status === DrawStatus.Voiding &&
          "bg-linear-to-br from-red-50/80 via-white to-rose-50/40 dark:from-red-950/30 dark:via-background dark:to-rose-950/20 shadow-red-200/30 dark:shadow-red-900/20"
      )}
    >
      <div
        className={`absolute inset-x-0 top-0 h-1.5 bg-linear-to-r ${vis.accent}`}
      />

      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`relative flex size-12 items-center justify-center rounded-xl shadow-md ${vis.iconBg}`}
            >
              <Radio className={`size-5 ${vis.iconColor}`} />
              <span className="absolute -right-1 -top-1 flex size-3">
                <span
                  className={cn(
                    "absolute inline-flex size-full animate-ping rounded-full opacity-75",
                    status === DrawStatus.SalesOpen && "bg-green-400",
                    status === DrawStatus.SalesClosed && "bg-amber-400",
                    status === DrawStatus.Published && "bg-violet-400",
                    status === DrawStatus.Settling && "bg-orange-400",
                    status === DrawStatus.Voiding && "bg-red-400",
                    status === DrawStatus.Scheduled && "bg-slate-400"
                  )}
                />
                <span
                  className={cn(
                    "relative inline-flex size-3 rounded-full",
                    status === DrawStatus.SalesOpen && "bg-green-500",
                    status === DrawStatus.SalesClosed && "bg-amber-500",
                    status === DrawStatus.Published && "bg-violet-500",
                    status === DrawStatus.Settling && "bg-orange-500",
                    status === DrawStatus.Voiding && "bg-red-500",
                    status === DrawStatus.Scheduled && "bg-slate-500"
                  )}
                />
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight text-foreground">
                  Kỳ {draw.drawNo} — Đang xử lý
                </h2>
                <Power655DrawStatusBadge status={status} />
              </div>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                {draw.drawId} · {draw.drawDate} · Quay lúc{" "}
                <span className="font-semibold text-foreground">
                  {drawTime}
                </span>
              </p>
            </div>
          </div>

          {showCountdown && (
            <Badge
              variant="outline"
              className="shrink-0 gap-1.5 border-amber-300 bg-amber-50 px-3 py-1.5 text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
            >
              <Timer className="size-3.5" />
              <span className="font-mono tabular-nums">{remainMinutes}m</span>
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <JackpotPanel />

        {showStats && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl border bg-white/80 dark:bg-card p-3.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50">
                <Ticket className="size-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Vé đã bán</p>
                <p className="text-sm font-semibold tabular-nums">
                  {draw.stats!.ticketEntryCount.toLocaleString("vi-VN")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border bg-white/80 dark:bg-card p-3.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
                <CircleDollarSign className="size-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Doanh thu</p>
                <p className="text-sm font-semibold tabular-nums">
                  {formatVND(draw.stats!.totalSalesAmount)}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border bg-white/60 dark:bg-muted/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <Unlock className="size-4 text-green-500" />
            <span className="text-xs font-medium text-muted-foreground">
              Mở bán
            </span>
            <span className="rounded-md bg-background px-2 py-0.5 font-mono text-sm font-semibold tabular-nums shadow-sm">
              {draw.sales.openAt
                ? formatVNTime(new Date(draw.sales.openAt))
                : "—"}
            </span>
          </div>
          <Separator orientation="vertical" className="hidden h-5 sm:block" />
          <div className="flex items-center gap-2">
            <Lock className="size-4 text-red-500" />
            <span className="text-xs font-medium text-muted-foreground">
              Đóng bán
            </span>
            <span className="rounded-md bg-background px-2 py-0.5 font-mono text-sm font-semibold tabular-nums shadow-sm">
              {formatVNTime(new Date(draw.sales.closeAt))}
            </span>
          </div>
          <Separator orientation="vertical" className="hidden h-5 sm:block" />
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-blue-500" />
            <span className="text-xs font-medium text-muted-foreground">
              Quay số
            </span>
            <span className="rounded-md bg-background px-2 py-0.5 font-mono text-sm font-semibold tabular-nums shadow-sm">
              {drawTime}
            </span>
          </div>
        </div>

        {!isTerminal && (
          <div className="flex items-center justify-between border-t pt-4">
            <div className="flex flex-wrap items-center gap-2">
              {canOpenSales(status) && (
                <OpenSalesAction draw={draw} disabled={false} />
              )}
              {canCloseSales(status) && (
                <CloseSalesAction draw={draw} disabled={false} />
              )}
              {canPublishResult(status) && (
                <PublishResultAction draw={draw} disabled={false} />
              )}
              {canTriggerSettle(status) && (
                <TriggerSettleAction draw={draw} disabled={false} />
              )}
              {canEditSchedule(status) && (
                <EditScheduleAction draw={draw} disabled={false} />
              )}
            </div>
            {canVoidDraw(status) && (
              <VoidDrawAction draw={draw} disabled={false} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function Power655QueueDrawCard({ draw }: { draw: CurrentDrawInfo }) {
  const status = draw.status;
  const vis = STATUS_VISUALS[status] ?? DEFAULT_VISUAL;
  const drawTime = formatVNTime(new Date(draw.drawTime));

  const isTerminal =
    status === DrawStatus.Settled ||
    status === DrawStatus.Void ||
    status === DrawStatus.Settling ||
    status === DrawStatus.Voiding;

  return (
    <Card className={`relative overflow-hidden ${vis.border}`}>
      <div
        className={`absolute inset-x-0 top-0 h-0.5 bg-linear-to-r ${vis.accent}`}
      />

      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex size-8 items-center justify-center rounded-lg ${vis.iconBg}`}
            >
              <Radio className={`size-3.5 ${vis.iconColor}`} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-foreground">
                  Kỳ {draw.drawNo}
                </span>
                <Power655DrawStatusBadge status={status} />
              </div>
              <p className="font-mono text-[11px] text-muted-foreground">
                {draw.drawId}
              </p>
            </div>
          </div>

          {draw.splitCycleIntent && (
            <Badge variant="destructive" className="text-[10px] px-1.5">
              Chia JP
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Lock className="size-3 text-red-400" />
            {formatVNTime(new Date(draw.sales.closeAt))}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3 text-blue-400" />
            <span className="font-semibold text-foreground">{drawTime}</span>
          </span>
          <span className="ml-auto text-[10px] text-muted-foreground/60">
            {draw.drawDate}
          </span>
        </div>

        {!isTerminal && (
          <div className="flex items-center justify-between border-t pt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {canOpenSales(status) && (
                <OpenSalesAction draw={draw} disabled={false} />
              )}
              {canCloseSales(status) && (
                <CloseSalesAction draw={draw} disabled={false} />
              )}
              {canPublishResult(status) && (
                <PublishResultAction draw={draw} disabled={false} />
              )}
              {canTriggerSettle(status) && (
                <TriggerSettleAction draw={draw} disabled={false} />
              )}
              {canEditSchedule(status) && (
                <EditScheduleAction draw={draw} disabled={false} />
              )}
            </div>
            {canVoidDraw(status) && (
              <VoidDrawAction draw={draw} disabled={false} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
