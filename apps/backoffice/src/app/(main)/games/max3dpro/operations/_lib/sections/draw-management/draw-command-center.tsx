"use client";

import Link from "next/link";

import { DrawStatus, GameProduct } from "@megawin/game-core/entities";
import { displayVNDateTime } from "@megawin/shared/utils";
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

import { DrawStatusBadge } from "@/components/games/max3dpro/draw-status-badge";
import { Countdown, getOverdueGrace, OverdueBanner, useOverdue } from "@/components/games/shared/draw-countdown";
import { getDrawLifecycleSteps, LifecycleStepper } from "@/components/games/shared/draw-lifecycle-stepper";
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
  // Max3D Pro 1 kỳ/ngày (T3/T5/T7) — chu kỳ dài hơn NHIỀU so với Keno/Bingo18, nên
  // dùng ngưỡng grace riêng của Max3dpro (5'/15') qua getOverdueGrace, KHÔNG dùng
  // DEFAULT_OVERDUE_GRACE (30s/2m — sẽ báo động giả liên tục).
  const grace = getOverdueGrace(GameProduct.Max3dpro);
  const closeOverdue =
    useOverdue(status === DrawStatus.SalesOpen ? draw.salesCloseAt : undefined, grace.close) &&
    status === DrawStatus.SalesOpen;
  const publishOverdue =
    useOverdue(status === DrawStatus.SalesClosed ? draw.scheduledDrawAt : undefined, grace.publish) &&
    status === DrawStatus.SalesClosed;

  const canEdit = [DrawStatus.Scheduled, DrawStatus.SalesOpen].includes(status as never);
  // Cấm huỷ kỳ nếu đã từng kết sổ (settledAt là high-water mark, không bị $unset
  // khi republish). Sau khi sửa kết quả của kỳ đã settle, status về Published
  // nhưng đây là luồng chờ resettle — chỉ được kết sổ lại, không được huỷ.
  // Backend cũng guard tương ứng trong VoidDrawUseCase.
  const canVoid =
    !draw.settledAt && [DrawStatus.Scheduled, DrawStatus.SalesClosed, DrawStatus.Published].includes(status as never);
  // Cho phép sửa kết quả khi:
  //   - status = Published (kể cả lần đầu hay sau settle để chuẩn bị resettle).
  //   - status = Settled (phát hiện sai sót sau khi đã kết sổ → mở luồng resettle).
  // Form sửa kết quả nay gộp cả tham chiếu Vietlott; sửa riêng vietlottRef (không
  // đổi kết quả) sẽ KHÔNG kích hoạt resettle — backend tự phân biệt.
  // Khi status = Settling, action bar bị ẩn hoàn toàn (xem `!isSettling` bên dưới)
  // nên không cần guard riêng cho nút này.
  const canRepublish = status === DrawStatus.Published || status === DrawStatus.Settled;
  const canReopenSales = status === DrawStatus.SalesClosed;
  const isVoided = status === DrawStatus.Void || status === DrawStatus.Voiding;
  const isSettled = status === DrawStatus.Settled;
  const isSettling = status === DrawStatus.Settling;
  // Banner Settling có thể bị "kẹt" nếu worker không start được (SFN_START_FAILED)
  // hoặc staff reload trang giữa chừng. Nút "Thử lại" kín đáo gọi lại đúng action
  // (Settle lần đầu hoặc Resettle) — backend idempotent nên an toàn để bấm lại.
  const settlingRetryHandler = isResettleSession(draw) ? onTriggerResettle : onTriggerSettle;

  const nextAction = getNextAction(
    draw,
    { onOpenSales, onCloseSales, onPublishResult, onTriggerSettle, onTriggerResettle },
    isResettleReady,
  );

  const accentGradient =
    (
      {
        [DrawStatus.SalesOpen]: "from-emerald-500 via-green-500 to-teal-500",
        [DrawStatus.SalesClosed]: "from-amber-500 to-orange-500",
        [DrawStatus.Published]: "from-violet-500 via-purple-500 to-fuchsia-500",
        [DrawStatus.Settling]: "from-orange-500 to-red-500",
        [DrawStatus.Settled]: "from-slate-400 to-slate-500",
        [DrawStatus.Scheduled]: "from-slate-300 to-slate-400",
        [DrawStatus.Void]: "from-red-600 to-rose-700",
        [DrawStatus.Voiding]: "from-red-500 to-rose-600",
      } as Record<string, string>
    )[status] ?? "from-border to-border";

  const cardBorder =
    (
      {
        [DrawStatus.SalesOpen]: "border-green-200 dark:border-green-800",
        [DrawStatus.SalesClosed]: "border-amber-200 dark:border-amber-800",
        [DrawStatus.Published]: "border-violet-200 dark:border-violet-800",
        [DrawStatus.Settling]: "border-orange-200 dark:border-orange-800",
        [DrawStatus.Void]: "border-red-200 dark:border-red-800",
        [DrawStatus.Voiding]: "border-red-200 dark:border-red-800",
        [DrawStatus.Settled]: "border-slate-200 dark:border-slate-700",
        [DrawStatus.Scheduled]: "border-border",
      } as Record<string, string>
    )[status] ?? "border-border";

  const iconBg =
    (
      {
        [DrawStatus.SalesOpen]: "bg-green-100 dark:bg-green-900/60",
        [DrawStatus.SalesClosed]: "bg-amber-100 dark:bg-amber-900/60",
        [DrawStatus.Published]: "bg-violet-100 dark:bg-violet-900/60",
        [DrawStatus.Settling]: "bg-orange-100 dark:bg-orange-900/60",
        [DrawStatus.Settled]: "bg-slate-100 dark:bg-slate-800",
        [DrawStatus.Scheduled]: "bg-slate-100 dark:bg-slate-800",
        [DrawStatus.Void]: "bg-red-100 dark:bg-red-900/60",
        [DrawStatus.Voiding]: "bg-red-100 dark:bg-red-900/60",
      } as Record<string, string>
    )[status] ?? "bg-muted/40";

  const iconColor =
    (
      {
        [DrawStatus.SalesOpen]: "text-green-600 dark:text-green-400",
        [DrawStatus.SalesClosed]: "text-amber-600 dark:text-amber-400",
        [DrawStatus.Published]: "text-violet-600 dark:text-violet-400",
        [DrawStatus.Settling]: "text-orange-600 dark:text-orange-400",
        [DrawStatus.Settled]: "text-slate-500 dark:text-slate-400",
        [DrawStatus.Scheduled]: "text-slate-500 dark:text-slate-400",
        [DrawStatus.Void]: "text-red-600 dark:text-red-400",
        [DrawStatus.Voiding]: "text-red-600 dark:text-red-400",
      } as Record<string, string>
    )[status] ?? "text-muted-foreground";

  const pingColor =
    (
      {
        [DrawStatus.SalesOpen]: "bg-green-400",
        [DrawStatus.SalesClosed]: "bg-amber-400",
        [DrawStatus.Published]: "bg-violet-400",
        [DrawStatus.Settling]: "bg-orange-400",
        [DrawStatus.Void]: "bg-red-400",
        [DrawStatus.Voiding]: "bg-red-400",
      } as Record<string, string>
    )[status] ?? "";

  const dotColor =
    (
      {
        [DrawStatus.SalesOpen]: "bg-green-500",
        [DrawStatus.SalesClosed]: "bg-amber-500",
        [DrawStatus.Published]: "bg-violet-500",
        [DrawStatus.Settling]: "bg-orange-500",
        [DrawStatus.Void]: "bg-red-500",
        [DrawStatus.Voiding]: "bg-red-500",
      } as Record<string, string>
    )[status] ?? "";

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
  ].includes(status as never);

  return (
    <div className={cn("overflow-hidden rounded-xl border", cardBorder)}>
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
                <h2 className="text-sm font-semibold tracking-tight">Max 3D Pro — {draw.drawDate}</h2>
                <DrawStatusBadge
                  status={status}
                  awaitingResettle={status === DrawStatus.Published && !!draw.settledAt}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-muted-foreground shrink-0 font-mono text-xs">{draw.drawId}</p>
                <ScheduleChips draw={draw} />
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
                    href={`/games/max3dpro/reports/settle?drawId=${draw.drawId}&level=draw-tenants`}
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
          </div>
        )}

        {closeOverdue && <OverdueBanner message="Quá giờ đóng bán, hãy đóng kỳ này." />}
        {publishOverdue && <OverdueBanner message="Quá giờ quay số nhưng chưa công bố kết quả." />}

        {/* Void info */}
        {isVoided && voidInfo && (
          <div className="border-destructive/30 bg-destructive/5 mt-4 space-y-1 rounded-lg border px-4 py-3">
            <p className="text-destructive flex items-center gap-1.5 text-sm font-semibold dark:text-red-400">
              <AlertTriangle className="size-3.5" /> Kỳ đã bị hủy
            </p>
            <p className="text-muted-foreground text-xs">"{voidInfo.reason}"</p>
            <p className="text-muted-foreground text-xs">
              Hủy bởi <span className="text-foreground font-medium">{voidInfo.voidedBy}</span> ·{" "}
              {displayVNDateTime(voidInfo.voidedAt)}
            </p>
          </div>
        )}

        {isSettling && (
          <div className="bg-muted/40 mt-4 flex items-center justify-between gap-2.5 rounded-lg border px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <Loader2 className="size-3.5 shrink-0 animate-spin text-orange-500" />
              <p className="text-xs font-medium">Đang kết sổ...</p>
            </div>
            {settlingRetryHandler && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={settlingRetryHandler}
                    className="text-muted-foreground/70 hover:text-foreground text-2xs inline-flex shrink-0 items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="size-3" /> Thử lại
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-56">
                  Dùng khi kết sổ bị treo (worker không khởi động hoặc vừa tải lại trang). An toàn để bấm — nếu đang
                  chạy bình thường, hệ thống sẽ bỏ qua.
                </TooltipContent>
              </Tooltip>
            )}
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
                  className={cn(
                    nextAction.className === "bg-amber-600 text-white hover:bg-amber-700" &&
                      "bg-amber-600 text-white hover:bg-amber-700",
                    nextAction.className === "bg-violet-600 text-white hover:bg-violet-700" &&
                      "bg-violet-600 text-white hover:bg-violet-700",
                    nextAction.className === "bg-orange-600 text-white hover:bg-orange-700" &&
                      "bg-orange-600 text-white hover:bg-orange-700",
                  )}
                  size="sm"
                  onClick={nextAction.handler}
                >
                  <nextAction.icon className="size-3.5" /> {nextAction.label}
                </Button>
              )}
              {canRepublish && (
                <Button variant="outline" size="sm" onClick={onRepublishResult}>
                  <ClipboardPen className="size-3.5" /> Sửa kết quả
                </Button>
              )}
              {canReopenSales && (
                <Button variant="outline" size="sm" onClick={onOpenSales}>
                  <Unlock className="size-3.5" /> Mở lại bán
                </Button>
              )}
            </div>
            <div className="flex items-center gap-1">
              {canEdit && (
                <Button variant="ghost" size="sm" onClick={onEditSchedule} className="text-muted-foreground">
                  <Pencil className="size-3.5" /> Sửa lịch
                </Button>
              )}
              {canVoid && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onVoidDraw}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
