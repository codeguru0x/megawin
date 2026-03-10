"use client";

import Link from "next/link";
import {
  CalendarCheck,
  Ban,
  Clock,
  Loader2,
  Lock,
  Radio,
  Ticket,
  Unlock,
  CircleDollarSign,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DrawStatusBadge } from "@/components/games/lotto535/draw-status-badge";
import { formatVND } from "@megawin/shared/utils/number";
import { DrawStatus } from "@megawin/game-core/entities";
import { formatVNTime, displayVNTime, displayVNDateTime } from "@megawin/shared/utils/date";
import type { CurrentDrawInfo } from "@megawin/game-lotto535-application/use-cases/draws";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// ─── Status → visual mapping (đồng bộ với draw-command-center) ──────────────

const STATUS_VISUALS: Record<
  string,
  {
    border: string;
    accent: string;
    cardBg: string;
    iconBg: string;
    iconColor: string;
    pingColor: string;
    dotColor: string;
  }
> = {
  [DrawStatus.Scheduled]: {
    border: "border-border",
    accent: "from-slate-300 to-slate-400",
    cardBg: "",
    iconBg: "bg-slate-100 dark:bg-slate-800",
    iconColor: "text-slate-500 dark:text-slate-400",
    pingColor: "",
    dotColor: "",
  },
  [DrawStatus.SalesOpen]: {
    border: "border-green-200 dark:border-green-800",
    accent: "from-emerald-500 via-green-500 to-teal-500",
    cardBg:
      "bg-linear-to-br from-green-50/60 via-card to-emerald-50/30 dark:from-green-950/20 dark:via-card dark:to-emerald-950/10",
    iconBg: "bg-green-100 dark:bg-green-900/60",
    iconColor: "text-green-600 dark:text-green-400",
    pingColor: "bg-green-400",
    dotColor: "bg-green-500",
  },
  [DrawStatus.SalesClosed]: {
    border: "border-amber-200 dark:border-amber-800",
    accent: "from-amber-500 to-orange-500",
    cardBg:
      "bg-linear-to-br from-amber-50/60 via-card to-orange-50/30 dark:from-amber-950/20 dark:via-card dark:to-orange-950/10",
    iconBg: "bg-amber-100 dark:bg-amber-900/60",
    iconColor: "text-amber-600 dark:text-amber-400",
    pingColor: "bg-amber-400",
    dotColor: "bg-amber-500",
  },
  [DrawStatus.Published]: {
    border: "border-violet-200 dark:border-violet-800",
    accent: "from-violet-500 via-purple-500 to-fuchsia-500",
    cardBg:
      "bg-linear-to-br from-violet-50/60 via-card to-purple-50/30 dark:from-violet-950/20 dark:via-card dark:to-purple-950/10",
    iconBg: "bg-violet-100 dark:bg-violet-900/60",
    iconColor: "text-violet-600 dark:text-violet-400",
    pingColor: "bg-violet-400",
    dotColor: "bg-violet-500",
  },
  [DrawStatus.Settling]: {
    border: "border-orange-200 dark:border-orange-800",
    accent: "from-orange-500 to-red-500",
    cardBg:
      "bg-linear-to-br from-orange-50/60 via-card to-red-50/30 dark:from-orange-950/20 dark:via-card dark:to-red-950/10",
    iconBg: "bg-orange-100 dark:bg-orange-900/60",
    iconColor: "text-orange-600 dark:text-orange-400",
    pingColor: "bg-orange-400",
    dotColor: "bg-orange-500",
  },
  [DrawStatus.Voiding]: {
    border: "border-red-200 dark:border-red-800",
    accent: "from-red-500 to-rose-600",
    cardBg:
      "bg-linear-to-br from-red-50/60 via-card to-rose-50/30 dark:from-red-950/20 dark:via-card dark:to-rose-950/10",
    iconBg: "bg-red-100 dark:bg-red-900/60",
    iconColor: "text-red-600 dark:text-red-400",
    pingColor: "bg-red-400",
    dotColor: "bg-red-500",
  },
  [DrawStatus.Settled]: {
    border: "border-slate-200 dark:border-slate-700",
    accent: "from-slate-400 to-slate-500",
    cardBg: "",
    iconBg: "bg-slate-100 dark:bg-slate-800",
    iconColor: "text-slate-500 dark:text-slate-400",
    pingColor: "",
    dotColor: "",
  },
  [DrawStatus.Void]: {
    border: "border-red-200 dark:border-red-800",
    accent: "from-red-600 to-rose-700",
    cardBg:
      "bg-linear-to-br from-red-50/60 via-card to-rose-50/30 dark:from-red-950/20 dark:via-card dark:to-rose-950/10",
    iconBg: "bg-red-100 dark:bg-red-900/60",
    iconColor: "text-red-600 dark:text-red-400",
    pingColor: "",
    dotColor: "",
  },
};

const DEFAULT_VISUAL: (typeof STATUS_VISUALS)[string] = {
  border: "border-border",
  accent: "from-border to-border",
  cardBg: "",
  iconBg: "bg-muted/40",
  iconColor: "text-muted-foreground",
  pingColor: "",
  dotColor: "",
};

const OPS_BASE = "/games/lotto535/operations";

function opsLink(drawId?: string) {
  return drawId ? `${OPS_BASE}?draw=${drawId}` : OPS_BASE;
}

const SHOW_PING = new Set([
  DrawStatus.SalesOpen,
  DrawStatus.SalesClosed,
  DrawStatus.Published,
  DrawStatus.Settling,
  DrawStatus.Voiding,
]);

function getStatusIcon(status: string) {
  if (status === DrawStatus.Settled) return CalendarCheck;
  if (status === DrawStatus.Void || status === DrawStatus.Voiding) return Ban;
  if (status === DrawStatus.Settling) return Loader2;
  return Radio;
}

// ─── Primary Draw Card ──────────────────────────────────────────────────────

export function Lotto535PrimaryDrawCard({ draw }: { draw: CurrentDrawInfo }) {
  const status = draw.status;
  const vis = STATUS_VISUALS[status] ?? DEFAULT_VISUAL;
  const drawTime = formatVNTime(new Date(draw.drawTime));
  const StatusIcon = getStatusIcon(status);
  const showPing = SHOW_PING.has(status as any);

  const showStats =
    draw.stats &&
    [
      DrawStatus.SalesClosed,
      DrawStatus.Published,
      DrawStatus.Settling,
      DrawStatus.Settled,
    ].includes(status as any);

  return (
    <div className={cn("rounded-xl border overflow-hidden", vis.border, vis.cardBg)}>
      <div className={cn("h-1 w-full bg-linear-to-r", vis.accent)} />

      <div className="px-5 py-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={cn(
                "relative flex size-9 items-center justify-center rounded-lg shrink-0 mt-0.5 shadow-sm",
                vis.iconBg,
              )}
            >
              <StatusIcon
                className={cn(
                  "size-4",
                  vis.iconColor,
                  status === DrawStatus.Settling && "animate-spin",
                )}
              />
              {showPing && (
                <span className="absolute -right-0.5 -top-0.5 flex size-2.5">
                  <span
                    className={cn(
                      "absolute inline-flex size-full animate-ping rounded-full opacity-70",
                      vis.pingColor,
                    )}
                  />
                  <span
                    className={cn("relative inline-flex size-2.5 rounded-full", vis.dotColor)}
                  />
                </span>
              )}
            </div>
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href={opsLink(draw.drawId)}
                  className="text-sm font-semibold tracking-tight hover:underline underline-offset-2"
                >
                  Kỳ {draw.drawNo} — {draw.drawDate}
                </Link>
                <DrawStatusBadge status={status} />
              </div>
              <p className="text-[11px] text-muted-foreground font-mono">{draw.drawId}</p>
            </div>
          </div>
        </div>

        {/* Schedule chips */}
        <div className="flex items-center gap-4 flex-wrap">
          {draw.sales.openAt && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  title={undefined}
                  className="flex items-center gap-1.5 cursor-default select-none"
                >
                  <Unlock className="size-3.5 text-emerald-500" />
                  <span className="text-xs text-muted-foreground">Mở bán</span>
                  <span className="text-xs font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {displayVNTime(draw.sales.openAt)}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="font-mono text-xs">
                {displayVNDateTime(draw.sales.openAt)}
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                title={undefined}
                className="flex items-center gap-1.5 cursor-default select-none"
              >
                <Lock className="size-3.5 text-amber-500" />
                <span className="text-xs text-muted-foreground">Đóng bán</span>
                <span className="text-xs font-mono font-bold tabular-nums text-amber-600 dark:text-amber-400">
                  {displayVNTime(draw.sales.closeAt)}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="font-mono text-xs">
              {displayVNDateTime(draw.sales.closeAt)}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                title={undefined}
                className="flex items-center gap-1.5 cursor-default select-none"
              >
                <Clock className="size-3.5 text-violet-500" />
                <span className="text-xs text-muted-foreground">Quay số</span>
                <span className="text-xs font-mono font-bold tabular-nums text-violet-600 dark:text-violet-400">
                  {drawTime}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="font-mono text-xs">
              {displayVNDateTime(draw.drawTime)}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Metrics */}
        {showStats && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl border bg-white/80 dark:bg-card p-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50">
                <Ticket className="size-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Vé đã bán</p>
                <p className="text-sm font-semibold tabular-nums">
                  {draw.stats!.ticketEntryCount.toLocaleString("vi-VN")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border bg-white/80 dark:bg-card p-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
                <CircleDollarSign className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Doanh thu</p>
                <p className="text-sm font-semibold tabular-nums">
                  {formatVND(draw.stats!.totalSalesAmount)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Queue Draw Card ────────────────────────────────────────────────────────

export function Lotto535QueueDrawCard({ draw }: { draw: CurrentDrawInfo }) {
  const status = draw.status;
  const vis = STATUS_VISUALS[status] ?? DEFAULT_VISUAL;
  const drawTime = formatVNTime(new Date(draw.drawTime));
  const StatusIcon = getStatusIcon(status);
  const showPing = SHOW_PING.has(status as any);

  return (
    <div className={cn("rounded-xl border overflow-hidden", vis.border)}>
      <div className={cn("h-0.5 w-full bg-linear-to-r", vis.accent)} />

      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "relative flex size-7 items-center justify-center rounded-lg shrink-0",
                vis.iconBg,
              )}
            >
              <StatusIcon className={cn("size-3", vis.iconColor)} />
              {showPing && (
                <span className="absolute -right-0.5 -top-0.5 flex size-2">
                  <span
                    className={cn(
                      "absolute inline-flex size-full animate-ping rounded-full opacity-70",
                      vis.pingColor,
                    )}
                  />
                  <span className={cn("relative inline-flex size-2 rounded-full", vis.dotColor)} />
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <Link
                  href={opsLink(draw.drawId)}
                  className="text-sm font-semibold text-foreground hover:underline underline-offset-2"
                >
                  Kỳ {draw.drawNo}
                </Link>
                <DrawStatusBadge status={status} />
              </div>
              <p className="font-mono text-[11px] text-muted-foreground">{draw.drawId}</p>
            </div>
          </div>

          {draw.splitCycleIntent && (
            <Badge variant="destructive" className="text-[10px] px-1.5">
              Chia JP
            </Badge>
          )}
        </div>

        {/* Schedule compact */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1 cursor-default select-none">
                <Lock className="size-3 text-amber-400" />
                {displayVNTime(draw.sales.closeAt)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="font-mono text-xs">
              {displayVNDateTime(draw.sales.closeAt)}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1 cursor-default select-none">
                <Clock className="size-3 text-violet-400" />
                <span className="font-semibold text-foreground">{drawTime}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="font-mono text-xs">
              {displayVNDateTime(draw.drawTime)}
            </TooltipContent>
          </Tooltip>
          <span className="ml-auto text-[10px] text-muted-foreground/60">{draw.drawDate}</span>
        </div>
      </div>
    </div>
  );
}
