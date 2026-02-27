"use client";

import {
  CheckCircle2,
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
import { DrawStatusBadge } from "@/components/games/lotto535/draw-status-badge";
import {
  JackpotDisplay,
  formatVND,
} from "@/components/games/lotto535/jackpot-display";
import { DrawStatus } from "@megawin/game-core/entities";
import { formatVNTime } from "@megawin/shared/utils/date";
import type { CurrentDrawInfo, DrawSummary } from "./use-draws";

import { OpenSalesAction } from "./actions/open-sales-action";
import { CloseSalesAction } from "./actions/close-sales-action";
import { PublishResultAction } from "./actions/publish-result-action";
import { TriggerSettleAction } from "./actions/trigger-settle-action";
import { EditScheduleAction } from "./actions/edit-schedule-action";
import { VoidDrawAction } from "./actions/void-draw-action";

// ─────────────────────────────────────────────
// Status logic
// ─────────────────────────────────────────────

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

// ─────────────────────────────────────────────
// Status → visual mapping
// ─────────────────────────────────────────────

const STATUS_VISUALS: Record<
  string,
  {
    border: string;
    accent: string;
    iconBg: string;
    iconColor: string;
  }
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
};

const DEFAULT_VISUAL = {
  border: "border-border",
  accent: "from-blue-500 to-cyan-500",
  iconBg: "bg-muted",
  iconColor: "text-muted-foreground",
};

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function ActiveDrawCard({ draw }: { draw: CurrentDrawInfo }) {
  const status = draw.status;
  const vis = STATUS_VISUALS[status] ?? DEFAULT_VISUAL;
  const drawTime = formatVNTime(new Date(draw.drawTime));

  const now = new Date();
  const closeAt = new Date(draw.sales.closeAt);
  const remainMs = Math.max(0, closeAt.getTime() - now.getTime());
  const remainMinutes = Math.floor(remainMs / 60_000);
  const remainHours = Math.floor(remainMinutes / 60);
  const remainMins = remainMinutes % 60;

  const showCountdown = status === DrawStatus.SalesOpen && remainMs > 0;
  const showStats =
    draw.stats &&
    (status === DrawStatus.SalesClosed ||
      status === DrawStatus.Published ||
      status === DrawStatus.Settling ||
      status === DrawStatus.Settled);

  const isTerminal =
    status === DrawStatus.Settled ||
    status === DrawStatus.Void ||
    status === DrawStatus.Settling;

  return (
    <Card className={`relative overflow-hidden ${vis.border}`}>
      <div
        className={`absolute inset-x-0 top-0 h-1 bg-linear-to-r ${vis.accent}`}
      />

      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex size-10 items-center justify-center rounded-xl ${vis.iconBg}`}
            >
              <Radio
                className={`size-4.5 ${vis.iconColor} ${status === DrawStatus.SalesOpen ? "animate-pulse" : ""}`}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight text-foreground">
                  Kỳ đang vận hành
                </h2>
                <DrawStatusBadge status={status} />
              </div>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                {draw.drawId} · Kỳ {draw.drawNo} · {draw.drawDate}
              </p>
            </div>
          </div>

          {/* Right: Countdown */}
          {showCountdown && (
            <Badge
              variant="outline"
              className="shrink-0 gap-1.5 border-amber-300 bg-amber-50 px-3 py-1.5 text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
            >
              <Timer className="size-3.5" />
              <span className="font-mono tabular-nums">
                {remainHours > 0 ? `${remainHours}h ` : ""}
                {remainMins}m
              </span>
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Metrics */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-3 rounded-xl border bg-card p-3.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50">
              <CircleDollarSign className="size-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Jackpot</p>
              <JackpotDisplay amount={draw.jackpot.openingAmount} size="sm" />
            </div>
          </div>

          {showStats && (
            <>
              <div className="flex items-center gap-3 rounded-xl border bg-card p-3.5">
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

              <div className="flex items-center gap-3 rounded-xl border bg-card p-3.5">
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

              <div className="flex items-center gap-3 rounded-xl border bg-card p-3.5">
                <div className="flex size-9 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/50">
                  <Clock className="size-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tổng dòng</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {draw.stats!.totalLineCount.toLocaleString("vi-VN")}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Schedule timeline */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border bg-muted/40 px-4 py-3">
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

        {/* Action bar */}
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

// ─────────────────────────────────────────────
// Completed Draw Card — kỳ đã xong, mờ, không action
// ─────────────────────────────────────────────

const SETTLED_VISUAL = {
  border: "border-slate-200/60 dark:border-slate-800",
  accent: "from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-700",
  iconBg: "bg-slate-100 dark:bg-slate-800/60",
  iconColor: "text-slate-400 dark:text-slate-500",
};

export function CompletedDrawCard({ draw }: { draw: DrawSummary }) {
  const drawTime = formatVNTime(new Date(draw.drawTime));
  const fin = draw.financial;

  return (
    <Card
      className={cn(
        "relative overflow-hidden opacity-70",
        SETTLED_VISUAL.border,
        "bg-slate-50/50 dark:bg-slate-950/20"
      )}
    >
      <div
        className={`absolute inset-x-0 top-0 h-1 bg-linear-to-r ${SETTLED_VISUAL.accent}`}
      />

      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex size-10 items-center justify-center rounded-xl ${SETTLED_VISUAL.iconBg}`}
            >
              <CheckCircle2
                className={`size-4.5 ${SETTLED_VISUAL.iconColor}`}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">
                  Kỳ {draw.drawNo} — Đã hoàn tất
                </h2>
                <DrawStatusBadge status={draw.status} />
                {draw.isSplitCycle && (
                  <Badge
                    variant="outline"
                    className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300 text-[10px]"
                  >
                    Kỳ chia giải
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground/70">
                {draw.drawId} · {draw.drawDate} · Quay lúc {drawTime}
              </p>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Row 1: Jackpot + Vé + Doanh thu */}
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCell
            icon={<CircleDollarSign className="size-3.5 text-amber-500/70" />}
            iconBg="bg-amber-100/50 dark:bg-amber-900/30"
            label="Jackpot đầu kỳ"
            value={formatVND(draw.jackpotAmount)}
          />
          <MetricCell
            icon={<Ticket className="size-3.5 text-blue-500/70" />}
            iconBg="bg-blue-100/50 dark:bg-blue-900/30"
            label="Vé đã bán"
            value={
              draw.ticketEntryCount
                ? draw.ticketEntryCount.toLocaleString("vi-VN")
                : "—"
            }
          />
          <MetricCell
            icon={<CircleDollarSign className="size-3.5 text-emerald-500/70" />}
            iconBg="bg-emerald-100/50 dark:bg-emerald-900/30"
            label="Doanh thu"
            value={draw.totalRevenue ? formatVND(draw.totalRevenue) : "—"}
          />
        </div>

        {/* Row 2: Financial breakdown (nếu có) */}
        {fin && (
          <div className="grid gap-3 sm:grid-cols-4">
            <MetricCell
              icon={
                <CircleDollarSign className="size-3.5 text-violet-500/70" />
              }
              iconBg="bg-violet-100/50 dark:bg-violet-900/30"
              label="Giải cố định"
              value={formatVND(fin.totalFixedPrizes)}
            />
            <MetricCell
              icon={<CircleDollarSign className="size-3.5 text-pink-500/70" />}
              iconBg="bg-pink-100/50 dark:bg-pink-900/30"
              label="HH Đại lý"
              value={formatVND(fin.totalAgentCommission)}
            />
            <MetricCell
              icon={<CircleDollarSign className="size-3.5 text-sky-500/70" />}
              iconBg="bg-sky-100/50 dark:bg-sky-900/30"
              label="Cty thu về"
              value={formatVND(fin.companyTake)}
            />
            <MetricCell
              icon={<CircleDollarSign className="size-3.5 text-amber-500/70" />}
              iconBg="bg-amber-100/50 dark:bg-amber-900/30"
              label="Tích luỹ JP"
              value={formatVND(fin.jackpotContribution)}
              highlight={fin.jackpotContribution > 0}
            />
          </div>
        )}

        {/* Row 3: Jackpot cuối kỳ */}
        {draw.jackpotClosingAmount != null && (
          <div className="flex items-center gap-3 rounded-xl border bg-card/50 px-4 py-2.5">
            <CircleDollarSign className="size-4 text-amber-500/60" />
            <span className="text-xs text-muted-foreground/70">
              Jackpot cuối kỳ:
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums text-amber-600/80 dark:text-amber-400/80">
              {formatVND(draw.jackpotClosingAmount)}
            </span>
          </div>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground/70">
          <span>{draw.hasResult ? "Đã có kết quả" : "Chưa có kết quả"}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCell({
  icon,
  iconBg,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card/50 p-3">
      <div
        className={`flex size-8 items-center justify-center rounded-lg ${iconBg}`}
      >
        {icon}
      </div>
      <div>
        <p className="text-[11px] text-muted-foreground/70">{label}</p>
        <p
          className={cn(
            "text-sm font-semibold tabular-nums",
            highlight
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground"
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
