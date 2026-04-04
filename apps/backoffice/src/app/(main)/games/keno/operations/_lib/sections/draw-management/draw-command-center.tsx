"use client";

/**
 * Keno – Draw Command Center
 *
 * Lifecycle stepper + action buttons cho trang vận hành Keno.
 * Keno khác Mega 6/45:
 * - Hiển thị drawNo + drawTime (nhiều kỳ/ngày, chu kỳ 8 phút)
 * - Không có jackpot section
 * - Kết quả: 20 số (01-80)
 * - Màu accent: orange/amber (brand Keno)
 */

import {
  CheckCircle2,
  Circle,
  Clock,
  Lock,
  Unlock,
  Radio,
  Timer,
  Pencil,
  Trash2,
  RotateCcw,
  FileText,
  ChevronRight,
  AlertTriangle,
  Ban,
  Loader2,
  CalendarCheck,
  ClipboardPen,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { DrawStatus } from "@megawin/game-core/entities";
import { formatNumber, displayVNTime, displayVNDateTime } from "@megawin/shared/utils";
import { KenoDrawStatusBadge } from "@/components/games/keno/draw-status-badge";
import { Button } from "@/components/ui/button";
import type { DrawSelectorItem } from "../../use-operations";
import type { KenoDrawResult, VoidInfo } from "../../types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface DrawCommandProps {
  draw: DrawSelectorItem;
  result?: KenoDrawResult;
  voidInfo?: VoidInfo;
  onOpenSales?: () => void;
  onCloseSales?: () => void;
  onPublishResult?: () => void;
  onRepublishResult?: () => void;
  onTriggerSettle?: () => void;
  onEditSchedule?: () => void;
  onVoidDraw?: () => void;
}

// ─── Lifecycle Stepper ───────────────────────────────────────────────────────

type StepState = "done" | "active" | "pending";

interface Step {
  label: string;
  time?: string;
  state: StepState;
}

function getSteps(draw: DrawSelectorItem, result?: KenoDrawResult): Step[] {
  const s = draw.status;
  const order = [
    DrawStatus.Scheduled,
    DrawStatus.SalesOpen,
    DrawStatus.SalesClosed,
    DrawStatus.Published,
    DrawStatus.Settling,
    DrawStatus.Settled,
  ];
  type OrderedStatus = (typeof order)[number];
  const done = (statuses: string[]) =>
    statuses.some((st) => order.indexOf(s as OrderedStatus) > order.indexOf(st as OrderedStatus));
  const active = (target: string) => s === target;

  return [
    {
      label: "Mở bán",
      state: active(DrawStatus.SalesOpen)
        ? "active"
        : done([DrawStatus.SalesOpen])
          ? "done"
          : "pending",
    },
    {
      label: "Đóng bán",
      time: displayVNTime(draw.salesCloseAt),
      state: active(DrawStatus.SalesClosed)
        ? "active"
        : done([DrawStatus.SalesClosed])
          ? "done"
          : "pending",
    },
    {
      label: "Công bố KQ",
      state: active(DrawStatus.Published)
        ? "active"
        : done([DrawStatus.Published])
          ? "done"
          : "pending",
    },
    {
      label: "Kết sổ",
      time: result?.settledAt ? displayVNTime(result.settledAt) : undefined,
      state: active(DrawStatus.Settling) ? "active" : s === DrawStatus.Settled ? "done" : "pending",
    },
  ];
}

function LifecycleStepper({ steps }: { steps: Step[] }) {
  return (
    <div className="flex items-start w-full">
      {steps.map((step, i) => (
        <div key={i} className="flex items-start flex-1 min-w-0">
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div
              className={cn(
                "flex size-6 items-center justify-center rounded-full border-2 transition-all",
                step.state === "done" && "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40",
                step.state === "active" && "border-orange-500 bg-orange-50 dark:bg-orange-950/40",
                step.state === "pending" && "border-border bg-background",
              )}
            >
              {step.state === "done" ? (
                <CheckCircle2 className="size-3 text-emerald-500" />
              ) : step.state === "active" ? (
                <span className="size-1.5 rounded-full bg-orange-500 animate-pulse" />
              ) : (
                <Circle className="size-3 text-muted-foreground/30" />
              )}
            </div>
            <div className="text-center w-16">
              <p
                className={cn(
                  "text-[11px] font-medium leading-tight",
                  step.state === "active" && "text-foreground font-semibold",
                  step.state === "done" && "text-muted-foreground",
                  step.state === "pending" && "text-muted-foreground/40",
                )}
              >
                {step.label}
              </p>
              {step.time && (
                <p className="text-[9px] font-mono tabular-nums text-muted-foreground/60 mt-0.5">
                  {step.time}
                </p>
              )}
            </div>
          </div>
          {i < steps.length - 1 && (
            <div className="flex-1 mt-3 mx-1 min-w-4">
              <div
                className={cn(
                  "h-[2px] w-full rounded-full",
                  steps[i + 1]?.state !== "pending" ? "bg-emerald-400" : "bg-border/60",
                )}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Next Action ─────────────────────────────────────────────────────────────

function getNextAction(draw: DrawSelectorItem, handlers: Partial<DrawCommandProps>) {
  switch (draw.status) {
    case DrawStatus.Scheduled:
      return { label: "Mở bán", handler: handlers.onOpenSales, icon: Unlock, className: "" };
    case DrawStatus.SalesOpen:
      return {
        label: "Đóng bán",
        className: "bg-amber-600 hover:bg-amber-700 text-white",
        handler: handlers.onCloseSales,
        icon: Lock,
      };
    case DrawStatus.SalesClosed:
      return {
        label: "Công bố kết quả",
        className: "bg-violet-600 hover:bg-violet-700 text-white",
        handler: handlers.onPublishResult,
        icon: Radio,
      };
    case DrawStatus.Published:
      return {
        label: "Kết sổ (Settle)",
        handler: handlers.onTriggerSettle,
        icon: ChevronRight,
        className: "",
      };
    default:
      return null;
  }
}

// ─── Schedule Chips ──────────────────────────────────────────────────────────

function ScheduleChips({ draw }: { draw: DrawSelectorItem }) {
  const now = new Date();
  const items: {
    icon: React.ReactNode;
    label: string;
    time: string;
    fullDateTime: string;
    active: boolean;
    color: string;
  }[] = [];

  if (draw.salesOpenAt) {
    const past = new Date(draw.salesOpenAt) < now;
    items.push({
      icon: (
        <Unlock
          className={cn("size-3.5 shrink-0", past ? "text-emerald-400" : "text-emerald-500")}
        />
      ),
      label: "Mở bán",
      time: displayVNTime(draw.salesOpenAt),
      fullDateTime: displayVNDateTime(draw.salesOpenAt),
      active: !past,
      color: "text-emerald-600 dark:text-emerald-400",
    });
  }

  const closePast = new Date(draw.salesCloseAt) < now;
  items.push({
    icon: (
      <Lock className={cn("size-3.5 shrink-0", closePast ? "text-amber-400" : "text-amber-500")} />
    ),
    label: "Đóng bán",
    time: displayVNTime(draw.salesCloseAt),
    fullDateTime: displayVNDateTime(draw.salesCloseAt),
    active: !closePast,
    color: "text-amber-600 dark:text-amber-400",
  });

  if (draw.drawResultAt) {
    const past = new Date(draw.drawResultAt) < now;
    items.push({
      icon: (
        <Clock className={cn("size-3.5 shrink-0", past ? "text-violet-400" : "text-violet-500")} />
      ),
      label: "Quay số",
      time: displayVNTime(draw.drawResultAt),
      fullDateTime: displayVNDateTime(draw.drawResultAt),
      active: !past,
      color: "text-violet-600 dark:text-violet-400",
    });
  }

  return (
    <div className="flex items-center gap-3">
      {items.map((item) => (
        <Tooltip key={item.label}>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 cursor-default select-none">
              {item.icon}
              <span
                className={cn("text-xs", item.active ? "text-foreground" : "text-muted-foreground")}
              >
                {item.label}
              </span>
              <span
                className={cn(
                  "text-xs font-mono tabular-nums font-bold",
                  item.active ? item.color : "text-muted-foreground",
                )}
              >
                {item.time}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="font-mono text-xs">
            {item.fullDateTime}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DrawCommandCenter({
  draw,
  result,
  voidInfo,
  onOpenSales,
  onCloseSales,
  onPublishResult,
  onRepublishResult,
  onTriggerSettle,
  onEditSchedule,
  onVoidDraw,
}: DrawCommandProps) {
  const status = draw.status;
  const steps = getSteps(draw, result);
  const nextAction = getNextAction(draw, {
    onOpenSales,
    onCloseSales,
    onPublishResult,
    onTriggerSettle,
  });

  const canEdit = [DrawStatus.Scheduled, DrawStatus.SalesOpen].includes(status as any);
  const canVoid = [DrawStatus.Scheduled, DrawStatus.SalesClosed, DrawStatus.Published].includes(
    status as any,
  );
  const canRepublish = status === DrawStatus.Published || status === DrawStatus.Settled;
  const canReopenSales = status === DrawStatus.SalesClosed;
  const isVoided = status === DrawStatus.Void || status === DrawStatus.Voiding;
  const isSettled = status === DrawStatus.Settled;
  const isSettling = status === DrawStatus.Settling;

  // Keno brand: orange/amber accent
  const accentGradient =
    {
      [DrawStatus.SalesOpen]: "from-orange-500 via-amber-500 to-yellow-500",
      [DrawStatus.SalesClosed]: "from-amber-500 to-orange-500",
      [DrawStatus.Published]: "from-violet-500 via-purple-500 to-fuchsia-500",
      [DrawStatus.Settling]: "from-orange-600 to-red-500",
      [DrawStatus.Settled]: "from-slate-400 to-slate-500",
      [DrawStatus.Scheduled]: "from-slate-300 to-slate-400",
      [DrawStatus.Void]: "from-red-600 to-rose-700",
      [DrawStatus.Voiding]: "from-red-500 to-rose-600",
    }[status] ?? "from-border to-border";

  const cardBg =
    {
      [DrawStatus.SalesOpen]:
        "bg-linear-to-br from-orange-50/60 via-card to-amber-50/30 dark:from-orange-950/20 dark:via-card dark:to-amber-950/10",
      [DrawStatus.SalesClosed]:
        "bg-linear-to-br from-amber-50/60 via-card to-orange-50/30 dark:from-amber-950/20 dark:via-card dark:to-orange-950/10",
      [DrawStatus.Published]:
        "bg-linear-to-br from-violet-50/60 via-card to-purple-50/30 dark:from-violet-950/20 dark:via-card dark:to-purple-950/10",
      [DrawStatus.Settling]:
        "bg-linear-to-br from-orange-50/60 via-card to-red-50/30 dark:from-orange-950/20 dark:via-card dark:to-red-950/10",
      [DrawStatus.Void]:
        "bg-linear-to-br from-red-50/60 via-card to-rose-50/30 dark:from-red-950/20 dark:via-card dark:to-rose-950/10",
      [DrawStatus.Voiding]:
        "bg-linear-to-br from-red-50/60 via-card to-rose-50/30 dark:from-red-950/20 dark:via-card dark:to-rose-950/10",
      [DrawStatus.Settled]: "",
      [DrawStatus.Scheduled]: "",
    }[status] ?? "";

  const cardBorder =
    {
      [DrawStatus.SalesOpen]: "border-orange-200 dark:border-orange-800",
      [DrawStatus.SalesClosed]: "border-amber-200 dark:border-amber-800",
      [DrawStatus.Published]: "border-violet-200 dark:border-violet-800",
      [DrawStatus.Settling]: "border-orange-200 dark:border-orange-800",
      [DrawStatus.Void]: "border-red-200 dark:border-red-800",
      [DrawStatus.Voiding]: "border-red-200 dark:border-red-800",
      [DrawStatus.Settled]: "border-slate-200 dark:border-slate-700",
      [DrawStatus.Scheduled]: "border-border",
    }[status] ?? "border-border";

  const iconBg =
    {
      [DrawStatus.SalesOpen]: "bg-orange-100 dark:bg-orange-900/60",
      [DrawStatus.SalesClosed]: "bg-amber-100 dark:bg-amber-900/60",
      [DrawStatus.Published]: "bg-violet-100 dark:bg-violet-900/60",
      [DrawStatus.Settling]: "bg-orange-100 dark:bg-orange-900/60",
      [DrawStatus.Settled]: "bg-slate-100 dark:bg-slate-800",
      [DrawStatus.Scheduled]: "bg-slate-100 dark:bg-slate-800",
      [DrawStatus.Void]: "bg-red-100 dark:bg-red-900/60",
      [DrawStatus.Voiding]: "bg-red-100 dark:bg-red-900/60",
    }[status] ?? "bg-muted/40";

  const iconColor =
    {
      [DrawStatus.SalesOpen]: "text-orange-600 dark:text-orange-400",
      [DrawStatus.SalesClosed]: "text-amber-600 dark:text-amber-400",
      [DrawStatus.Published]: "text-violet-600 dark:text-violet-400",
      [DrawStatus.Settling]: "text-orange-600 dark:text-orange-400",
      [DrawStatus.Settled]: "text-slate-500 dark:text-slate-400",
      [DrawStatus.Scheduled]: "text-slate-500 dark:text-slate-400",
      [DrawStatus.Void]: "text-red-600 dark:text-red-400",
      [DrawStatus.Voiding]: "text-red-600 dark:text-red-400",
    }[status] ?? "text-muted-foreground";

  const showPing = [
    DrawStatus.SalesOpen,
    DrawStatus.SalesClosed,
    DrawStatus.Published,
    DrawStatus.Settling,
    DrawStatus.Voiding,
  ].includes(status as any);

  const pingColor =
    {
      [DrawStatus.SalesOpen]: "bg-orange-400",
      [DrawStatus.SalesClosed]: "bg-amber-400",
      [DrawStatus.Published]: "bg-violet-400",
      [DrawStatus.Settling]: "bg-orange-400",
      [DrawStatus.Void]: "bg-red-400",
      [DrawStatus.Voiding]: "bg-red-400",
      [DrawStatus.Settled]: "",
      [DrawStatus.Scheduled]: "",
    }[status] ?? "";

  const dotColor =
    {
      [DrawStatus.SalesOpen]: "bg-orange-500",
      [DrawStatus.SalesClosed]: "bg-amber-500",
      [DrawStatus.Published]: "bg-violet-500",
      [DrawStatus.Settling]: "bg-orange-500",
      [DrawStatus.Void]: "bg-red-500",
      [DrawStatus.Voiding]: "bg-red-500",
      [DrawStatus.Settled]: "",
      [DrawStatus.Scheduled]: "",
    }[status] ?? "";

  const StatusIcon =
    status === DrawStatus.Settled
      ? CalendarCheck
      : status === DrawStatus.Void || status === DrawStatus.Voiding
        ? Ban
        : status === DrawStatus.Settling
          ? Loader2
          : Radio;

  return (
    <div className={cn("rounded-xl border overflow-hidden", cardBorder, cardBg)}>
      <div className={cn("h-1 w-full bg-linear-to-r", accentGradient)} />

      <div className="px-5 py-4">
        {/* Row 1: Identity — Keno: hiển thị kỳ số + giờ quay */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={cn(
                "relative flex size-8 items-center justify-center rounded-lg shrink-0 mt-0.5 shadow-sm",
                iconBg,
              )}
            >
              <StatusIcon
                className={cn(
                  "size-3.5",
                  iconColor,
                  status === DrawStatus.Settling && "animate-spin",
                )}
              />
              {showPing && (
                <span className="absolute -right-0.5 -top-0.5 flex size-2.5">
                  <span
                    className={cn(
                      "absolute inline-flex size-full animate-ping rounded-full opacity-70",
                      pingColor,
                    )}
                  />
                  <span className={cn("relative inline-flex size-2.5 rounded-full", dotColor)} />
                </span>
              )}
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Keno: nhiều kỳ/ngày → hiển thị cả ngày + số kỳ */}
                <h2 className="text-sm font-semibold tracking-tight">
                  Keno — {draw.drawDate} · Kỳ {String(draw.drawNo).padStart(3, "0")}
                </h2>
                <KenoDrawStatusBadge status={status} />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-[11px] text-muted-foreground font-mono shrink-0">
                  {draw.drawId}
                </p>
                <ScheduleChips draw={draw} />
                {status === DrawStatus.SalesOpen && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium tabular-nums text-amber-600 dark:text-amber-400">
                    <Timer className="size-3 shrink-0" />
                    Đóng lúc {displayVNTime(draw.salesCloseAt)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: Stepper */}
        {!isVoided && (
          <div className="mt-4 flex flex-col items-center gap-3">
            <div className="w-full max-w-[45%] min-w-64">
              <LifecycleStepper steps={steps} />
            </div>
            {/* Kết quả đã chuyển sang section "Kết quả & Phân bổ giải thưởng" bên dưới */}
          </div>
        )}

        {/* Void info */}
        {isVoided && voidInfo && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 space-y-1">
            <p className="text-sm font-semibold text-destructive dark:text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="size-3.5" /> Kỳ đã bị hủy
            </p>
            <p className="text-xs text-muted-foreground">"{voidInfo.reason}"</p>
            <p className="text-xs text-muted-foreground">
              Hủy bởi <span className="font-medium text-foreground">{voidInfo.voidedBy}</span> ·{" "}
              {displayVNDateTime(voidInfo.voidedAt)} · Hoàn{" "}
              <span className="font-semibold tabular-nums text-foreground">
                {formatNumber(voidInfo.refundAmount)}
              </span>
            </p>
          </div>
        )}

        {isSettling && (
          <div className="mt-4 flex items-center gap-2.5 rounded-lg border bg-muted/40 px-3 py-2.5">
            <Loader2 className="size-3.5 text-orange-500 animate-spin shrink-0" />
            <p className="text-xs font-medium">Đang kết sổ...</p>
          </div>
        )}

        {status === DrawStatus.Scheduled && (
          <p className="mt-4 text-xs text-muted-foreground text-center py-1">
            Chưa có dữ liệu cược — kỳ chưa mở bán
          </p>
        )}

        {/* Action bar */}
        {!isSettling && !isVoided && (
          <div className="flex items-center justify-between gap-3 border-t mt-4 pt-3">
            <div className="flex items-center gap-2 flex-wrap">
              {nextAction && (
                <Button
                  className={cn("gap-1.5 font-medium", nextAction.className)}
                  size="sm"
                  onClick={nextAction.handler}
                >
                  <nextAction.icon className="size-3.5" /> {nextAction.label}
                </Button>
              )}
              {isSettled && (
                <Button variant="outline" size="sm" className="gap-1.5" disabled>
                  <RotateCcw className="size-3.5" /> Re-settle
                </Button>
              )}
              {canRepublish && (
                <Button variant="outline" size="sm" onClick={onRepublishResult} className="gap-1.5">
                  <ClipboardPen className="size-3.5" /> Sửa kết quả
                </Button>
              )}
              {canReopenSales && (
                <Button variant="outline" size="sm" onClick={onOpenSales} className="gap-1.5">
                  <Unlock className="size-3.5" /> Mở lại bán
                </Button>
              )}
            </div>
            <div className="flex items-center gap-1">
              {isSettled && (
                <Link
                  href={`/games/keno/reports/settle?drawId=${draw.drawId}&level=draw-tenants`}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5"
                >
                  <FileText className="size-3.5" /> Xem báo cáo
                </Link>
              )}
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onEditSchedule}
                  className="gap-1.5 text-muted-foreground"
                >
                  <Pencil className="size-3.5" /> Sửa lịch
                </Button>
              )}
              {canVoid && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onVoidDraw}
                  className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-3.5" /> Hủy kỳ
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
