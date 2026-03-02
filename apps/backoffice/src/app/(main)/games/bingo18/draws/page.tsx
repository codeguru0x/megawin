"use client";

import { CalendarClock, Loader2, ListOrdered } from "lucide-react";

import { useBingo18CurrentDraw } from "./_lib/use-draws";
import { useBingo18GameConfig } from "../config/_lib/use-game-config";
import { Bingo18CreateDrawDialog } from "./_lib/create-draw-dialog";
import {
  Bingo18PrimaryDrawCard,
  Bingo18QueueDrawCard,
} from "./_lib/active-draw-card";
import { Bingo18DrawHistorySection } from "./_lib/draw-history-section";

export default function Bingo18DrawsPage() {
  const { data, isLoading } = useBingo18CurrentDraw();
  const { data: gameConfig } = useBingo18GameConfig();
  const activeDraws = data?.activeDraws ?? [];
  const primaryDraw = activeDraws[0] ?? null;
  const queueDraws = activeDraws.slice(1);

  const interval = gameConfig?.play.drawIntervalMinutes ?? 6;
  const firstDraw = gameConfig?.play.firstDrawTime ?? "06:00";
  const lastDraw = gameConfig?.play.lastDrawTime ?? "21:54";

  return (
    <div className="@container/main flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-amber-500 to-orange-600 shadow-sm">
            <CalendarClock className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Bingo 18 — Quản lý kỳ quay
            </h1>
            <p className="text-xs text-muted-foreground">
              Quay mỗi {interval} phút ({firstDraw}–{lastDraw}). Mở/đóng bán,
              công bố kết quả, kết sổ.
            </p>
          </div>
        </div>
        <Bingo18CreateDrawDialog />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-dashed p-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : primaryDraw ? (
        <div className="space-y-5">
          <Bingo18PrimaryDrawCard draw={primaryDraw} />

          {queueDraws.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ListOrdered className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">
                  Hàng chờ
                </h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                  {queueDraws.length} kỳ
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {queueDraws.map((draw) => (
                  <Bingo18QueueDrawCard key={draw.drawId} draw={draw} />
                ))}
              </div>
            </div>
          )}
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

      <Bingo18DrawHistorySection />
    </div>
  );
}
