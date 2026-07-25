"use client";

/**
 * Power 6/55 – Draw Command Center
 *
 * Hiển thị lifecycle stepper, thông tin kỳ quay, và các action buttons.
 * Power 6/55 khác Mega 6/45: có bonusNumber trong kết quả, jackpot kép (JP1 + JP2).
 */

import Link from "next/link";

import { DrawStatus, GameProduct } from "@megawin/game-core/entities";
import { displayVNDateTime, formatNumber } from "@megawin/shared/utils";
import {
  AlertTriangle,
  Ban,
  CalendarCheck,
  ClipboardPen,
  FileText,
  Loader2,
  MoreVertical,
  Pencil,
  Radio,
  RefreshCw,
  RotateCcw,
  Trash2,
  Unlock,
} from "lucide-react";

import { Power655DrawStatusBadge as DrawStatusBadge } from "@/components/games/power655/draw-status-badge";
import {
  Countdown,
  getOverdueGrace,
  OverdueBanner,
  useOverdue,
} from "@/components/games/shared/draw-countdown";
import {
  getDrawLifecycleSteps,
  LifecycleStepper,
} from "@/components/games/shared/draw-lifecycle-stepper";
import { getNextAction } from "@/components/games/shared/draw-next-action";
import { shouldShowResettle } from "@/components/games/shared/draw-resettle";
import { ScheduleChips } from "@/components/games/shared/draw-schedule-chips";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import type { DrawResult, VoidInfo } from "../../types";
import type { DrawSelectorItem } from "../../use-operations";

interface DrawCommandProps {
  draw: DrawSelectorItem;
  result?: DrawResult;
  voidInfo?: VoidInfo;
  onOpenSales?: () => void;
  onCloseSales?: () => void;
  onPublishResult?: () => void;
  onRepublishResult?: () => void;
  onTriggerSettle?: () => void;
  onTriggerResettle?: () => void;
  onReopenForCascade?: () => void;
  onEditSchedule?: () => void;
  onVoidDraw?: () => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DrawCommandCenter({
  draw,
  voidInfo,
  onOpenSales,
  onCloseSales,
  onPublishResult,
  onRepublishResult,
  onTriggerSettle,
  onTriggerResettle,
  onReopenForCascade,
  onEditSchedule,
  onVoidDraw,
}: DrawCommandProps) {
  const status = draw.status as DrawStatus;
  const steps = getDrawLifecycleSteps(draw);
  const isResettleReady = shouldShowResettle(draw);

  // Overdue check — dùng ngưỡng grace riêng của Power 6/55 (đối soát Vietlott,
  // xem GAME_OVERDUE_GRACE). Countdown/Overdue nhận thẳng target ISO của kỳ đang chọn.
  const grace = getOverdueGrace(GameProduct.Power655);
  // close: quá salesCloseAt + grace mà vẫn SalesOpen → scheduler close-sales kẹt.
  const closeOverdue = useOverdue(
    status === DrawStatus.SalesOpen ? draw.salesCloseAt : undefined,
    grace.close,
  );
  // publish: quá giờ quay theo lịch + grace mà vẫn SalesClosed → worker publish kẹt.
  const publishOverdue = useOverdue(
    status === DrawStatus.SalesClosed ? draw.scheduledDrawAt : undefined,
    grace.publish,
  );
  const nextAction = getNextAction(
    draw,
    {
      onOpenSales,
      onCloseSales,
      onPublishResult,
      onTriggerSettle,
      onTriggerResettle,
    },
    isResettleReady,
  );

  const canEdit = [DrawStatus.Scheduled, DrawStatus.SalesOpen].includes(status as any);
  // Không cho huỷ kỳ đã từng settle (settledAt != null) — đó là luồng chờ resettle,
  // chỉ được "Kết sổ lại", không được huỷ. Backend cũng guard trong VoidDrawUseCase.
  const canVoid =
    !draw.settledAt &&
    [DrawStatus.Scheduled, DrawStatus.SalesClosed, DrawStatus.Published].includes(status as any);
  const canRepublish = status === DrawStatus.Published || status === DrawStatus.Settled;
  const canReopenSales = status === DrawStatus.SalesClosed;
  const isVoided = status === DrawStatus.Void || status === DrawStatus.Voiding;
  const isSettled = status === DrawStatus.Settled;
  const isSettling = status === DrawStatus.Settling;

  // Kỳ T+n trong cascade B2 với KẾT QUẢ SỐ KHÔNG ĐỔI → không đủ điều kiện
  // resettle thường (vì publish-result return sớm, không re-stamp publishedAt).
  // Hiển thị nút "Mở để kết sổ lại": status = Settled, đã từng settle, NHƯNG
  // drawResultAt KHÔNG mới hơn settledAt (đúng dấu hiệu kỳ chưa republish).
  // Guard cascade thật (có kỳ trước đang dở) do backend kiểm tra — UI chỉ mở lối vào.
  const canReopenForCascade = (() => {
    if (!onReopenForCascade) return false;
    if (status !== DrawStatus.Settled || !draw.settledAt) return false;
    if (!draw.drawResultAt) return true;
    return new Date(draw.drawResultAt) <= new Date(draw.settledAt);
  })();

  const accentGradient =
    {
      [DrawStatus.SalesOpen]: "from-emerald-500 via-green-500 to-teal-500",
      [DrawStatus.SalesClosed]: "from-amber-500 to-orange-500",
      [DrawStatus.Published]: "from-violet-500 via-purple-500 to-fuchsia-500",
      [DrawStatus.Settling]: "from-orange-500 to-red-500",
      [DrawStatus.Settled]: "from-slate-400 to-slate-500",
      [DrawStatus.Scheduled]: "from-slate-300 to-slate-400",
      [DrawStatus.Void]: "from-red-600 to-rose-700",
      [DrawStatus.Voiding]: "from-red-500 to-rose-600",
    }[status] ?? "from-border to-border";

  const cardBg =
    {
      [DrawStatus.SalesOpen]:
        "bg-linear-to-br from-green-50/60 via-card to-emerald-50/30 dark:from-green-950/20 dark:via-card dark:to-emerald-950/10",
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
      [DrawStatus.SalesOpen]: "border-green-200 dark:border-green-800",
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
      [DrawStatus.SalesOpen]: "bg-green-100 dark:bg-green-900/60",
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
      [DrawStatus.SalesOpen]: "text-green-600 dark:text-green-400",
      [DrawStatus.SalesClosed]: "text-amber-600 dark:text-amber-400",
      [DrawStatus.Published]: "text-violet-600 dark:text-violet-400",
      [DrawStatus.Settling]: "text-orange-600 dark:text-orange-400",
      [DrawStatus.Settled]: "text-slate-500 dark:text-slate-400",
      [DrawStatus.Scheduled]: "text-slate-500 dark:text-slate-400",
      [DrawStatus.Void]: "text-red-600 dark:text-red-400",
      [DrawStatus.Voiding]: "text-red-600 dark:text-red-400",
    }[status] ?? "text-muted-foreground";

  const pingColor =
    {
      [DrawStatus.SalesOpen]: "bg-green-400",
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
      [DrawStatus.SalesOpen]: "bg-green-500",
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

  const showPing = [
    DrawStatus.SalesOpen,
    DrawStatus.SalesClosed,
    DrawStatus.Published,
    DrawStatus.Settling,
    DrawStatus.Voiding,
  ].includes(status as any);

  // Menu phụ (góc phải trên): gom các action ít dùng / điều hướng — "Xem báo cáo",
  // "Mở để kết sổ lại", và chỗ cho audit log... Chỉ render khi có ít nhất 1 item.
  const hasOverflowMenu = isSettled || canReopenForCascade;

  return (
    <div className={cn("rounded-xl border overflow-hidden", cardBorder, cardBg)}>
      <div className={cn("h-1 w-full bg-linear-to-r", accentGradient)} />

      <div className="px-5 py-4">
        {/* Row 1: Identity */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0 flex-1">
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
                {/* Power 6/55: 1 kỳ/ngày nên hiển thị ngày */}
                <h2 className="text-sm font-semibold tracking-tight">
                  Power 6/55 — {draw.drawDate}
                </h2>
                <DrawStatusBadge status={status} />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-xs text-muted-foreground font-mono shrink-0">{draw.drawId}</p>
                <ScheduleChips draw={draw} />
                {status === DrawStatus.SalesOpen && (
                  <Countdown target={draw.salesCloseAt} prefix="Đóng bán sau" />
                )}
                {status === DrawStatus.SalesClosed && (
                  <Countdown target={draw.scheduledDrawAt} prefix="Quay số sau" />
                )}
              </div>
            </div>
          </div>

          {/* Overflow menu — action ít dùng / điều hướng, gom vào góc phải trên */}
          {hasOverflowMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground"
                  aria-label="Thao tác khác"
                >
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Thao tác khác</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {isSettled && (
                  <DropdownMenuItem asChild>
                    <Link
                      href={`/games/power655/reports/settle?drawId=${draw.drawId}&level=draw-tenants`}
                    >
                      <FileText className="size-3.5" /> Xem báo cáo
                    </Link>
                  </DropdownMenuItem>
                )}
                {canReopenForCascade && (
                  <DropdownMenuItem
                    onClick={onReopenForCascade}
                    className="text-orange-700 focus:text-orange-800 dark:text-orange-400 dark:focus:text-orange-300"
                  >
                    <RefreshCw className="size-3.5" /> Mở để kết sổ lại
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Row 2: Stepper */}
        {!isVoided && (
          <div className="mt-4 flex flex-col items-center gap-3">
            <div className="w-full max-w-[45%] min-w-64">
              <LifecycleStepper steps={steps} />
            </div>
          </div>
        )}

        {/* Overdue banners — cảnh báo scheduler/worker kẹt (dưới stepper). */}
        {closeOverdue && (
          <OverdueBanner message="Đã quá giờ đóng bán nhưng kỳ vẫn đang mở bán — kiểm tra scheduler đóng bán." />
        )}
        {publishOverdue && (
          <OverdueBanner message="Đã quá giờ quay theo lịch nhưng chưa công bố kết quả — kiểm tra worker công bố kết quả." />
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
