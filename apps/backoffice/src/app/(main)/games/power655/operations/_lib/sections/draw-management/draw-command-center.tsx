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
  Trash2,
  Unlock,
} from "lucide-react";

import { Power655DrawStatusBadge as DrawStatusBadge } from "@/components/games/power655/draw-status-badge";
import { Countdown, getOverdueGrace, OverdueBanner, useOverdue } from "@/components/games/shared/draw-countdown";
import { getDrawLifecycleSteps, LifecycleStepper } from "@/components/games/shared/draw-lifecycle-stepper";
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
  const closeOverdue = useOverdue(status === DrawStatus.SalesOpen ? draw.salesCloseAt : undefined, grace.close);
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
    !draw.settledAt && [DrawStatus.Scheduled, DrawStatus.SalesClosed, DrawStatus.Published].includes(status as any);
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
    if (!onReopenForCascade) {
      return false;
    }
    if (status !== DrawStatus.Settled || !draw.settledAt) {
      return false;
    }
    if (!draw.drawResultAt) {
      return true;
    }
    return new Date(draw.drawResultAt) <= new Date(draw.settledAt);
  })();

  const accentGradient =
    {
      [DrawStatus.SalesOpen]: "from-profit via-profit to-game-mega645",
      [DrawStatus.SalesClosed]: "from-warning to-loss",
      [DrawStatus.Published]: "from-game-max3d via-game-max3d to-game-max3dpro",
      [DrawStatus.Settling]: "from-warning to-loss",
      [DrawStatus.Settled]: "from-muted to-background",
      [DrawStatus.Scheduled]: "from-muted to-background",
      [DrawStatus.Void]: "from-loss to-warning",
      [DrawStatus.Voiding]: "from-loss to-warning",
    }[status] ?? "from-border to-muted";

  const cardBg =
    {
      [DrawStatus.SalesOpen]: "bg-linear-to-br from-profit/60 via-card to-profit/30 dark:via-card",
      [DrawStatus.SalesClosed]: "bg-linear-to-br from-warning/60 via-card to-warning/30 dark:via-card",
      [DrawStatus.Published]: "bg-linear-to-br from-game-max3d/60 via-card to-game-max3d/30 dark:via-card",
      [DrawStatus.Settling]: "bg-linear-to-br from-warning/60 via-card to-loss/30 dark:via-card",
      [DrawStatus.Void]: "bg-linear-to-br from-loss/60 via-card to-loss/30 dark:via-card",
      [DrawStatus.Voiding]: "bg-linear-to-br from-loss/60 via-card to-loss/30 dark:via-card",
      [DrawStatus.Settled]: "",
      [DrawStatus.Scheduled]: "",
    }[status] ?? "";

  const cardBorder =
    {
      [DrawStatus.SalesOpen]: "border-profit",
      [DrawStatus.SalesClosed]: "border-warning",
      [DrawStatus.Published]: "border-game-max3d",
      [DrawStatus.Settling]: "border-warning",
      [DrawStatus.Void]: "border-loss",
      [DrawStatus.Voiding]: "border-loss",
      [DrawStatus.Settled]: "border-border border-border",
      [DrawStatus.Scheduled]: "border-border",
    }[status] ?? "border-border";

  const iconBg =
    {
      [DrawStatus.SalesOpen]: "bg-profit",
      [DrawStatus.SalesClosed]: "bg-warning",
      [DrawStatus.Published]: "bg-game-max3d",
      [DrawStatus.Settling]: "bg-warning",
      [DrawStatus.Settled]: "bg-muted",
      [DrawStatus.Scheduled]: "bg-muted",
      [DrawStatus.Void]: "bg-loss",
      [DrawStatus.Voiding]: "bg-loss",
    }[status] ?? "bg-muted/40";

  const iconColor =
    {
      [DrawStatus.SalesOpen]: "text-profit",
      [DrawStatus.SalesClosed]: "text-warning",
      [DrawStatus.Published]: "text-game-max3d",
      [DrawStatus.Settling]: "text-warning",
      [DrawStatus.Settled]: "text-muted-foreground",
      [DrawStatus.Scheduled]: "text-muted-foreground",
      [DrawStatus.Void]: "text-loss",
      [DrawStatus.Voiding]: "text-loss",
    }[status] ?? "text-muted-foreground";

  const pingColor =
    {
      [DrawStatus.SalesOpen]: "bg-profit",
      [DrawStatus.SalesClosed]: "bg-warning",
      [DrawStatus.Published]: "bg-game-max3d",
      [DrawStatus.Settling]: "bg-warning",
      [DrawStatus.Void]: "bg-loss",
      [DrawStatus.Voiding]: "bg-loss",
      [DrawStatus.Settled]: "",
      [DrawStatus.Scheduled]: "",
    }[status] ?? "";

  const dotColor =
    {
      [DrawStatus.SalesOpen]: "bg-profit",
      [DrawStatus.SalesClosed]: "bg-warning",
      [DrawStatus.Published]: "bg-game-max3d",
      [DrawStatus.Settling]: "bg-warning",
      [DrawStatus.Void]: "bg-loss",
      [DrawStatus.Voiding]: "bg-loss",
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
    <div className={cn("overflow-hidden rounded-xl border", cardBorder, cardBg)}>
      <div className={cn("h-1 w-full bg-linear-to-r", accentGradient)} />

      <div className="px-5 py-4">
        {/* Row 1: Identity */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div
              className={cn(
                "relative mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg shadow-sm",
                iconBg,
              )}
            >
              <StatusIcon className={cn("size-3.5", iconColor, status === DrawStatus.Settling && "animate-spin")} />
              {showPing && (
                <span className="absolute -top-0.5 -right-0.5 flex size-2.5">
                  <span
                    className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-70", pingColor)}
                  />
                  <span className={cn("relative inline-flex size-2.5 rounded-full", dotColor)} />
                </span>
              )}
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                {/* Power 6/55: 1 kỳ/ngày nên hiển thị ngày */}
                <h2 className="text-sm font-semibold tracking-tight">Power 6/55 — {draw.drawDate}</h2>
                <DrawStatusBadge
                  status={status}
                  awaitingResettle={status === DrawStatus.Published && !!draw.settledAt}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-muted-foreground shrink-0 font-mono text-xs">{draw.drawId}</p>
                <ScheduleChips draw={draw} />
                {status === DrawStatus.SalesOpen && <Countdown target={draw.salesCloseAt} prefix="Đóng bán sau" />}
                {status === DrawStatus.SalesClosed && <Countdown target={draw.scheduledDrawAt} prefix="Quay số sau" />}
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
                  className="text-muted-foreground size-8 shrink-0"
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
                      prefetch={false}
                      href={`/games/power655/reports/settle?drawId=${draw.drawId}&level=draw-tenants`}
                    >
                      <FileText className="size-3.5" /> Xem báo cáo
                    </Link>
                  </DropdownMenuItem>
                )}
                {canReopenForCascade && (
                  <DropdownMenuItem onClick={onReopenForCascade} className="text-warning focus:text-warning">
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
        {closeOverdue && <OverdueBanner message="Đã quá giờ đóng bán nhưng kỳ vẫn đang mở bán — hãy đóng bán." />}
        {publishOverdue && (
          <OverdueBanner message="Đã quá giờ quay theo lịch nhưng chưa công bố kết quả — hãy công bố kết quả." />
        )}

        {/* Void info */}
        {isVoided && voidInfo && (
          <div className="border-destructive/30 bg-destructive/5 mt-4 space-y-1 rounded-lg border px-4 py-3">
            <p className="text-destructive text-loss flex items-center gap-1.5 text-sm font-semibold">
              <AlertTriangle className="size-3.5" /> Kỳ đã bị hủy
            </p>
            <p className="text-muted-foreground text-xs">"{voidInfo.reason}"</p>
            <p className="text-muted-foreground text-xs">
              Hủy bởi <span className="text-foreground font-medium">{voidInfo.voidedBy}</span> ·{" "}
              {displayVNDateTime(voidInfo.voidedAt)} · Hoàn{" "}
              <span className="text-foreground font-semibold tabular-nums">{formatNumber(voidInfo.refundAmount)}</span>
            </p>
          </div>
        )}

        {isSettling && (
          <div className="bg-muted/40 mt-4 flex items-center gap-2.5 rounded-lg border px-3 py-2.5">
            <Loader2 className="text-warning size-3.5 shrink-0 animate-spin" />
            <p className="text-xs font-medium">Đang kết sổ...</p>
          </div>
        )}

        {status === DrawStatus.Scheduled && (
          <p className="text-muted-foreground mt-4 py-1 text-center text-xs">Chưa có dữ liệu cược — kỳ chưa mở bán</p>
        )}

        {/* Action bar */}
        {!isSettling && !isVoided && (
          <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3">
            <div className="flex flex-wrap items-center gap-2">
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
                <Button variant="ghost" size="sm" onClick={onEditSchedule} className="text-muted-foreground gap-1.5">
                  <Pencil className="size-3.5" /> Sửa lịch
                </Button>
              )}
              {canVoid && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onVoidDraw}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
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
