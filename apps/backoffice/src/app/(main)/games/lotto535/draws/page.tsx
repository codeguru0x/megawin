"use client";

import { CalendarClock, CheckCircle2, Loader2, Radio } from "lucide-react";

import { useCurrentDraw, useTodayDraws } from "./_lib/use-draws";
import type { DrawSummary } from "./_lib/use-draws";
import { CreateDrawDialog } from "./_lib/create-draw-dialog";
import { ActiveDrawCard, CompletedDrawCard } from "./_lib/active-draw-card";
import { DrawHistorySection } from "./_lib/draw-history-section";
import { DrawStatus } from "@megawin/game-core/entities";

const ACTIVE_STATUSES: Set<string> = new Set([
  DrawStatus.Scheduled,
  DrawStatus.SalesOpen,
  DrawStatus.SalesClosed,
  DrawStatus.Published,
  DrawStatus.Settling,
]);

export default function AdminDrawsPage() {
  const { data: currentData, isLoading: isLoadingCurrent } = useCurrentDraw();
  const { data: todayData, isLoading: isLoadingToday } = useTodayDraws();

  const currentDraw = currentData?.currentDraw ?? null;
  const todayDraws = todayData?.draws ?? [];

  const completedDraws = todayDraws
    .filter(
      (d: DrawSummary) =>
        !ACTIVE_STATUSES.has(d.status) &&
        d.drawId !== currentDraw?.drawId
    )
    .sort((a: DrawSummary, b: DrawSummary) => b.drawNo - a.drawNo);

  const isLoading = isLoadingCurrent || isLoadingToday;

  return (
    <div className="@container/main flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-emerald-500 to-emerald-600 shadow-sm">
            <CalendarClock className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Lotto 5/35 — Quản lý kỳ quay
            </h1>
            <p className="text-xs text-muted-foreground">
              Vận hành kỳ quay: mở/đóng bán, công bố kết quả, kết sổ
            </p>
          </div>
        </div>
        <CreateDrawDialog />
      </div>

      {/* Today's Draws */}
      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-dashed p-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Active Draw */}
          {currentDraw ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Radio className="size-4 text-green-500 animate-pulse" />
                <h2 className="text-sm font-semibold text-foreground">
                  Kỳ đang vận hành
                </h2>
              </div>
              <ActiveDrawCard draw={currentDraw} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-muted/30 p-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
                <CalendarClock className="size-5 text-muted-foreground/50" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Không có kỳ đang vận hành
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Nhấn &ldquo;Tạo kỳ quay&rdquo; để bắt đầu kỳ mới.
                </p>
              </div>
            </div>
          )}

          {/* Completed Draws */}
          {completedDraws.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-foreground">
                  Kỳ đã hoàn tất hôm nay
                </h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                  {completedDraws.length} kỳ
                </span>
              </div>
              <div className="space-y-3">
                {completedDraws.map((draw: DrawSummary) => (
                  <CompletedDrawCard key={draw.drawId} draw={draw} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* History */}
      <DrawHistorySection />
    </div>
  );
}
