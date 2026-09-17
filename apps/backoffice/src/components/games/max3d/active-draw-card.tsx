"use client";

import Link from "next/link";

import { DrawStatus } from "@megawin/game-core/entities";
import { displayVNDateTime, displayVNTime, formatVND, formatVNTime } from "@megawin/shared/utils";
import { Ban, CalendarCheck, CircleDollarSign, Clock, Loader2, Lock, Radio, Ticket, Unlock } from "lucide-react";
import type { Route } from "next";

import type { CurrentDrawInfo } from "@/app/(main)/games/max3d/draws/_lib/use-draws";
import { DrawStatusBadge } from "@/components/games/max3d/draw-status-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ─── Status → visual mapping ─────────────────────────────────────────────────
// Max 3D dùng tông màu violet — T2/T4/T6, game triplet số

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
    accent: "from-muted to-background",
    cardBg: "",
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    pingColor: "",
    dotColor: "",
  },
  [DrawStatus.SalesOpen]: {
    border: "border-game-max3d",
    accent: "from-game-max3d via-game-max3d to-game-max3d",
    cardBg: "bg-linear-to-br from-game-max3d/60 via-card to-game-max3d/30 dark:via-card",
    iconBg: "bg-game-max3d",
    iconColor: "text-game-max3d",
    pingColor: "bg-game-max3d",
    dotColor: "bg-game-max3d",
  },
  [DrawStatus.SalesClosed]: {
    border: "border-warning",
    accent: "from-warning to-loss",
    cardBg: "bg-linear-to-br from-warning/60 via-card to-warning/30 dark:via-card",
    iconBg: "bg-warning",
    iconColor: "text-warning",
    pingColor: "bg-warning",
    dotColor: "bg-warning",
  },
  [DrawStatus.Published]: {
    border: "border-game-max3d",
    accent: "from-game-max3d via-game-max3dpro to-game-max3dpro",
    cardBg: "bg-linear-to-br from-game-max3d/60 via-card to-game-max3dpro/30 dark:via-card",
    iconBg: "bg-game-max3d",
    iconColor: "text-game-max3d",
    pingColor: "bg-game-max3d",
    dotColor: "bg-game-max3d",
  },
  [DrawStatus.Settling]: {
    border: "border-warning",
    accent: "from-warning to-loss",
    cardBg: "bg-linear-to-br from-warning/60 via-card to-loss/30 dark:via-card",
    iconBg: "bg-warning",
    iconColor: "text-warning",
    pingColor: "bg-warning",
    dotColor: "bg-warning",
  },
  [DrawStatus.Voiding]: {
    border: "border-loss",
    accent: "from-loss to-warning",
    cardBg: "bg-linear-to-br from-loss/60 via-card to-loss/30 dark:via-card",
    iconBg: "bg-loss",
    iconColor: "text-loss",
    pingColor: "bg-loss",
    dotColor: "bg-loss",
  },
  [DrawStatus.Settled]: {
    border: "border-border border-border",
    accent: "from-muted to-background",
    cardBg: "",
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    pingColor: "",
    dotColor: "",
  },
  [DrawStatus.Void]: {
    border: "border-loss",
    accent: "from-loss to-warning",
    cardBg: "bg-linear-to-br from-loss/60 via-card to-loss/30 dark:via-card",
    iconBg: "bg-loss",
    iconColor: "text-loss",
    pingColor: "",
    dotColor: "",
  },
};

const DEFAULT_VISUAL: (typeof STATUS_VISUALS)[string] = {
  border: "border-border",
  accent: "from-border to-muted",
  cardBg: "",
  iconBg: "bg-muted/40",
  iconColor: "text-muted-foreground",
  pingColor: "",
  dotColor: "",
};

const OPS_BASE = "/games/max3d/operations";

function opsLink(drawId?: string): Route {
  return (drawId ? `${OPS_BASE}?drawId=${drawId}` : OPS_BASE) as Route;
}

const SHOW_PING = new Set([
  DrawStatus.SalesOpen,
  DrawStatus.SalesClosed,
  DrawStatus.Published,
  DrawStatus.Settling,
  DrawStatus.Voiding,
]);

function getStatusIcon(status: string) {
  if (status === DrawStatus.Settled) {
    return CalendarCheck;
  }
  if (status === DrawStatus.Void || status === DrawStatus.Voiding) {
    return Ban;
  }
  if (status === DrawStatus.Settling) {
    return Loader2;
  }
  return Radio;
}

// ─── Primary Draw Card ────────────────────────────────────────────────────────

export function Max3dPrimaryDrawCard({ draw }: { draw: CurrentDrawInfo }) {
  const status = draw.status;
  const vis = STATUS_VISUALS[status] ?? DEFAULT_VISUAL;
  const drawTime = formatVNTime(new Date(draw.drawTime));
  const StatusIcon = getStatusIcon(status);
  const showPing = SHOW_PING.has(status as any);

  const showStats =
    draw.stats &&
    [DrawStatus.SalesClosed, DrawStatus.Published, DrawStatus.Settling, DrawStatus.Settled].includes(status as any);

  return (
    <div className={cn("overflow-hidden rounded-xl border", vis.border, vis.cardBg)}>
      <div className={cn("h-1 w-full bg-linear-to-r", vis.accent)} />

      <div className="space-y-4 px-5 py-4">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={cn(
                "relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg shadow-sm",
                vis.iconBg,
              )}
            >
              <StatusIcon className={cn("size-4", vis.iconColor, status === DrawStatus.Settling && "animate-spin")} />
              {showPing && (
                <span className="absolute -top-0.5 -right-0.5 flex size-2.5">
                  <span
                    className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-70", vis.pingColor)}
                  />
                  <span className={cn("relative inline-flex size-2.5 rounded-full", vis.dotColor)} />
                </span>
              )}
            </div>
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  prefetch={false}
                  href={opsLink(draw.drawId)}
                  className="text-sm font-semibold tracking-tight underline-offset-2 hover:underline"
                >
                  Kỳ {draw.drawNo} — {draw.drawDate}
                </Link>
                <DrawStatusBadge status={status} />
              </div>
              <p className="text-muted-foreground font-mono text-xs">{draw.drawId}</p>
            </div>
          </div>
        </div>

        {/* Schedule chips */}
        <div className="flex flex-wrap items-center gap-4">
          {draw.sales.openAt && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div title={undefined} className="flex cursor-default items-center gap-1.5 select-none">
                  <Unlock className="text-profit size-3.5" />
                  <span className="text-muted-foreground text-xs">Mở bán</span>
                  <span className="text-profit font-mono text-xs font-bold tabular-nums">
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
              <div title={undefined} className="flex cursor-default items-center gap-1.5 select-none">
                <Lock className="text-warning size-3.5" />
                <span className="text-muted-foreground text-xs">Đóng bán</span>
                <span className="text-warning font-mono text-xs font-bold tabular-nums">
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
              <div title={undefined} className="flex cursor-default items-center gap-1.5 select-none">
                <Clock className="text-game-max3d size-3.5" />
                <span className="text-muted-foreground text-xs">Quay số</span>
                <span className="text-game-max3d font-mono text-xs font-bold tabular-nums">{drawTime}</span>
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
            <div className="dark:bg-card flex items-center gap-3 rounded-xl border bg-white/80 p-3">
              <div className="bg-info flex size-8 items-center justify-center rounded-lg">
                <Ticket className="text-info size-3.5" />
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Vé đã bán</p>
                <p className="text-sm font-semibold tabular-nums">
                  {draw.stats!.ticketEntryCount.toLocaleString("vi-VN")}
                </p>
              </div>
            </div>
            <div className="dark:bg-card flex items-center gap-3 rounded-xl border bg-white/80 p-3">
              <div className="bg-profit flex size-8 items-center justify-center rounded-lg">
                <CircleDollarSign className="text-profit size-3.5" />
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Doanh thu</p>
                <p className="text-sm font-semibold tabular-nums">{formatVND(draw.stats!.totalSalesAmount)}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Queue Draw Card ──────────────────────────────────────────────────────────

export function Max3dQueueDrawCard({ draw }: { draw: CurrentDrawInfo }) {
  const status = draw.status;
  const vis = STATUS_VISUALS[status] ?? DEFAULT_VISUAL;
  const drawTime = formatVNTime(new Date(draw.drawTime));
  const StatusIcon = getStatusIcon(status);
  const showPing = SHOW_PING.has(status as any);

  return (
    <div className={cn("overflow-hidden rounded-xl border", vis.border)}>
      <div className={cn("h-0.5 w-full bg-linear-to-r", vis.accent)} />

      <div className="space-y-3 p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={cn("relative flex size-7 shrink-0 items-center justify-center rounded-lg", vis.iconBg)}>
              <StatusIcon className={cn("size-3", vis.iconColor)} />
              {showPing && (
                <span className="absolute -top-0.5 -right-0.5 flex size-2">
                  <span
                    className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-70", vis.pingColor)}
                  />
                  <span className={cn("relative inline-flex size-2 rounded-full", vis.dotColor)} />
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <Link
                  prefetch={false}
                  href={opsLink(draw.drawId)}
                  className="text-foreground text-sm font-semibold underline-offset-2 hover:underline"
                >
                  Kỳ {draw.drawNo}
                </Link>
                <DrawStatusBadge status={status} />
              </div>
              <p className="text-muted-foreground font-mono text-xs">{draw.drawId}</p>
            </div>
          </div>
        </div>

        {/* Schedule compact */}
        <div className="text-muted-foreground flex items-center gap-3 text-xs">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex cursor-default items-center gap-1 select-none">
                <Lock className="text-warning size-3" />
                {displayVNTime(draw.sales.closeAt)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="font-mono text-xs">
              {displayVNDateTime(draw.sales.closeAt)}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex cursor-default items-center gap-1 select-none">
                <Clock className="text-game-max3d size-3" />
                <span className="text-foreground font-semibold">{drawTime}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="font-mono text-xs">
              {displayVNDateTime(draw.drawTime)}
            </TooltipContent>
          </Tooltip>
          <span className="text-muted-foreground/60 ml-auto text-xs">{draw.drawDate}</span>
        </div>
      </div>
    </div>
  );
}
