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
  RotateCcw,
  Trash2,
  Unlock,
} from "lucide-react";

import { KenoDrawStatusBadge } from "@/components/games/keno/draw-status-badge";
import {
  Countdown,
  DEFAULT_OVERDUE_GRACE,
  OverdueBanner,
  useOverdue,
} from "@/components/games/shared/draw-countdown";
import {
  getDrawLifecycleSteps,
  LifecycleStepper,
} from "@/components/games/shared/draw-lifecycle-stepper";
import { getNextAction } from "@/components/games/shared/draw-next-action";
import { isResettleSession, shouldShowResettle } from "@/components/games/shared/draw-resettle";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { KenoDrawResult, VoidInfo } from "../../types";
import type { DrawSelectorItem } from "../../use-operations";

interface DrawCommandProps {
  draw: DrawSelectorItem;
  result?: KenoDrawResult;
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
  onEditSchedule,
  onVoidDraw,
}: DrawCommandProps) {
  const status = draw.status;
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
    !draw.settledAt &&
    [DrawStatus.Scheduled, DrawStatus.SalesClosed, DrawStatus.Published].includes(status as any);
  // Cho phép sửa kết quả khi:
  //   - status = Published (kết quả vừa publish, kể cả lần đầu hay đã settle xong và republish chuẩn bị resettle)
  //   - status = Settled (kịch bản phát hiện sai sót sau khi đã kết sổ → mở luồng resettle)
  const canRepublish = status === DrawStatus.Published || status === DrawStatus.Settled;
  const canReopenSales = status === DrawStatus.SalesClosed;
  const isVoided = status === DrawStatus.Void || status === DrawStatus.Voiding;
  const isSettled = status === DrawStatus.Settled;
  const isSettling = status === DrawStatus.Settling;
  // Banner Settling có thể bị "kẹt" nếu worker không start được (SFN_START_FAILED)
  // hoặc staff reload trang giữa chừng. Nút "Thử lại" kín đáo gọi lại đúng action
  // (Settle vs Resettle) — backend idempotent nên bấm khi đang chạy bình thường
  // cũng vô hại (lock held → 409 rõ ràng, hoặc trùng execution name → no-op).
  const settlingRetryHandler = isResettleSession(draw) ? onTriggerResettle : onTriggerSettle;

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

  // ── Overdue detection: trạng thái "kẹt" khi scheduler/worker không chạy ────
  // Keno chu kỳ ngắn ~8 phút → dùng ngưỡng grace mặc định (30s / 2 phút).
  // SalesOpen quá giờ đóng + grace → close-sales scheduler có thể lỗi.
  const closeOverdue =
    useOverdue(
      status === DrawStatus.SalesOpen ? draw.salesCloseAt : undefined,
      DEFAULT_OVERDUE_GRACE.close,
    ) && status === DrawStatus.SalesOpen;
  // SalesClosed quá giờ quay + grace mà chưa Published → publish worker có thể lỗi.
  const publishOverdue =
    useOverdue(
      status === DrawStatus.SalesClosed ? draw.scheduledDrawAt : undefined,
      DEFAULT_OVERDUE_GRACE.publish,
    ) && status === DrawStatus.SalesClosed;

  return (
    <div className={cn("rounded-xl border overflow-hidden", cardBorder, cardBg)}>
      <div className={cn("h-1 w-full bg-linear-to-r", accentGradient)} />

      <div className="px-5 py-4">
        {/* Row 1: Identity — Keno: hiển thị kỳ số + giờ quay */}
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
                {/* Countdown theo trạng thái — thay chip giờ tĩnh, người trực ca
                    không cần tự nhìn đồng hồ (Keno chu kỳ ~8 phút).
                    Không có countdown "Mở bán sau": salesOpenAt chỉ set NGAY khi
                    mở bán (không có đặt lịch mở bán trước). */}
                {status === DrawStatus.SalesOpen && !closeOverdue && (
                  <Countdown
                    target={draw.salesCloseAt}
                    prefix="Đóng bán sau"
                    className="text-amber-600 dark:text-amber-400"
                  />
                )}
                {status === DrawStatus.SalesClosed && !publishOverdue && (
                  <Countdown
                    target={draw.scheduledDrawAt}
                    prefix="Quay số sau"
                    className="text-violet-600 dark:text-violet-400"
                  />
                )}
              </div>
            </div>
          </div>
          {isSettled && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-muted-foreground"
                >
                  <MoreVertical className="size-4" />
                  <span className="sr-only">Thao tác khác</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Thao tác khác</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link
                    href={`/games/keno/reports/settle?drawId=${draw.drawId}&level=draw-tenants`}
                  >
                    <FileText className="size-3.5" /> Xem báo cáo
                  </Link>
                </DropdownMenuItem>
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
            {/* Kết quả đã chuyển sang section "Kết quả & Phân bổ giải thưởng" bên dưới */}
          </div>
        )}

        {/* Overdue banners: trạng thái kẹt — scheduler/worker không chuyển status đúng giờ */}
        {closeOverdue && <OverdueBanner message="Quá giờ đóng bán, hãy đóng kỳ này." />}
        {publishOverdue && <OverdueBanner message="Quá giờ quay số nhưng chưa công bố kết quả." />}

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
          <div className="mt-4 flex items-center justify-between gap-2.5 rounded-lg border bg-muted/40 px-3 py-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <Loader2 className="size-3.5 text-orange-500 animate-spin shrink-0" />
              <p className="text-xs font-medium">Đang kết sổ...</p>
            </div>
            {settlingRetryHandler && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={settlingRetryHandler}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors shrink-0"
                  >
                    <RotateCcw className="size-3" /> Thử lại
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-56 text-xs">
                  Dùng khi kết sổ bị treo (worker không khởi động hoặc vừa tải lại trang). An toàn
                  để bấm — nếu đang chạy bình thường, hệ thống sẽ bỏ qua.
                </TooltipContent>
              </Tooltip>
            )}
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
