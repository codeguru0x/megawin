"use client";

/**
 * Bingo 18 – Draw Command Center
 *
 * Lifecycle stepper + action buttons cho trang vận hành Bingo 18.
 * Bingo 18 khác Keno:
 * - Hiển thị drawNo + drawTime (nhiều kỳ/ngày, chu kỳ 6 phút)
 * - Không có jackpot
 * - Kết quả: 3 xúc xắc (1-6) + sum
 * - Màu accent: amber/green (brand Bingo 18)
 */
import Link from "next/link";

import { DrawStatus } from "@megawin/game-core/entities";
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
  Trash2,
  Unlock,
} from "lucide-react";

import { Bingo18DrawStatusBadge } from "@/components/games/bingo18/draw-status-badge";
import { Countdown, DEFAULT_OVERDUE_GRACE, OverdueBanner, useOverdue } from "@/components/games/shared/draw-countdown";
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

import type { Bingo18DrawResult, VoidInfo } from "../../types";
import type { DrawSelectorItem } from "../../use-operations";

interface DrawCommandProps {
  draw: DrawSelectorItem;
  result?: Bingo18DrawResult;
  voidInfo?: VoidInfo;
  onOpenSales?: () => void;
  onCloseSales?: () => void;
  onPublishResult?: () => void;
  onRepublishResult?: () => void;
  onTriggerSettle?: () => void;
  onTriggerResettle?: () => void;
  onEditSchedule?: () => void;
  onVoidDraw?: () => void;
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function DrawCommandCenter({
  draw,
  voidInfo,
  onOpenSales,
  onCloseSales,
  onPublishResult,
  onRepublishResult,
  onTriggerSettle,
  onTriggerResettle,
  onEditSchedule,
  onVoidDraw,
}: DrawCommandProps) {
  const status = draw.status as DrawStatus;
  const steps = getDrawLifecycleSteps(draw);
  const isResettleReady = shouldShowResettle(draw);
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
  // Cấm huỷ kỳ nếu đã từng kết sổ (settledAt là high-water mark, không bị $unset
  // khi republish). Sau khi sửa kết quả của kỳ đã settle, status về Published
  // nhưng đây là luồng chờ resettle — chỉ được kết sổ lại, không được huỷ.
  // Backend cũng guard tương ứng trong VoidDrawUseCase.
  const canVoid =
    !draw.settledAt && [DrawStatus.Scheduled, DrawStatus.SalesClosed, DrawStatus.Published].includes(status as any);
  // Cho phép sửa kết quả khi:
  //   - status = Published (kết quả vừa publish, kể cả lần đầu hay đã settle xong và republish chuẩn bị resettle)
  //   - status = Settled (kịch bản phát hiện sai sót sau khi đã kết sổ → mở luồng resettle)
  const canRepublish = status === DrawStatus.Published || status === DrawStatus.Settled;
  const canReopenSales = status === DrawStatus.SalesClosed;
  const isVoided = status === DrawStatus.Void || status === DrawStatus.Voiding;
  const isSettled = status === DrawStatus.Settled;
  const isSettling = status === DrawStatus.Settling;

  // Bingo 18 brand: amber/green accent
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

  const showPing = [
    DrawStatus.SalesOpen,
    DrawStatus.SalesClosed,
    DrawStatus.Published,
    DrawStatus.Settling,
    DrawStatus.Voiding,
  ].includes(status as any);

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

  // ── Overdue detection: trạng thái "kẹt" khi scheduler/worker không chạy ────
  // Bingo18 chu kỳ rất ngắn (~6 phút) → dùng ngưỡng grace mặc định (30s / 2 phút).
  // SalesOpen quá giờ đóng + grace → close-sales scheduler có thể lỗi.
  const closeOverdue =
    useOverdue(status === DrawStatus.SalesOpen ? draw.salesCloseAt : undefined, DEFAULT_OVERDUE_GRACE.close) &&
    status === DrawStatus.SalesOpen;
  // SalesClosed quá giờ quay + grace mà chưa Published → publish worker có thể lỗi.
  const publishOverdue =
    useOverdue(status === DrawStatus.SalesClosed ? draw.scheduledDrawAt : undefined, DEFAULT_OVERDUE_GRACE.publish) &&
    status === DrawStatus.SalesClosed;

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
                <h2 className="text-sm font-semibold tracking-tight">
                  Bingo 18 — {draw.drawDate} · Kỳ {String(draw.drawNo).padStart(3, "0")}
                </h2>
                <Bingo18DrawStatusBadge
                  status={status}
                  awaitingResettle={status === DrawStatus.Published && !!draw.settledAt}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-muted-foreground shrink-0 font-mono text-xs">{draw.drawId}</p>
                <ScheduleChips draw={draw} />
                {/* Countdown theo trạng thái — thay chip giờ tĩnh, người trực ca
                    không cần tự nhìn đồng hồ (Bingo18 chu kỳ ~6 phút).
                    Không có countdown "Mở bán sau": salesOpenAt chỉ set NGAY khi
                    mở bán (không có đặt lịch mở bán trước). */}
                {status === DrawStatus.SalesOpen && !closeOverdue && (
                  <Countdown target={draw.salesCloseAt} prefix="Đóng bán sau" className="text-warning" />
                )}
                {status === DrawStatus.SalesClosed && !publishOverdue && (
                  <Countdown target={draw.scheduledDrawAt} prefix="Quay số sau" className="text-game-max3d" />
                )}
              </div>
            </div>
          </div>
          {isSettled && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground size-7 shrink-0">
                  <MoreVertical className="size-4" />
                  <span className="sr-only">Thao tác khác</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Thao tác khác</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link
                    prefetch={false}
                    href={`/games/bingo18/reports/settle?drawId=${draw.drawId}&level=draw-tenants`}
                  >
                    <FileText className="size-3.5" /> Xem báo cáo
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Stepper */}
        {!isVoided && (
          <div className="mt-4 flex flex-col items-center gap-3">
            <div className="w-full max-w-[45%] min-w-64">
              <LifecycleStepper steps={steps} />
            </div>
          </div>
        )}

        {/* Overdue banners: trạng thái kẹt — scheduler/worker không chuyển status đúng giờ */}
        {closeOverdue && <OverdueBanner message="Quá giờ đóng bán, hãy đóng kỳ này." />}
        {publishOverdue && <OverdueBanner message="Quá giờ quay số nhưng chưa công bố kết quả." />}

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
