"use client";

import { CalendarClock, ListOrdered, Loader2 } from "lucide-react";

import { Bingo18PrimaryDrawCard, Bingo18QueueDrawCard } from "@/components/games/bingo18/active-draw-card";

import { useBingo18GameConfig } from "../config/game/_lib/use-game-config";
import { Bingo18DrawHistorySection } from "./_lib/draw-history-section";
import { useBingo18CurrentDraw } from "./_lib/use-draws";

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
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-green-500 to-green-600 shadow-sm">
          <CalendarClock className="size-4.5 text-white" />
        </div>
        <div>
          <h1 className="text-foreground text-lg font-semibold tracking-tight">Bingo 18 — Kỳ quay</h1>
          <p className="text-muted-foreground text-xs">
            Quay mỗi {interval} phút ({firstDraw}–{lastDraw}).
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-dashed p-16">
          <Loader2 className="text-muted-foreground size-8 animate-spin" />
        </div>
      ) : primaryDraw ? (
        <div className="space-y-5">
          <Bingo18PrimaryDrawCard draw={primaryDraw} />

          {queueDraws.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ListOrdered className="text-muted-foreground size-4" />
                <h2 className="text-foreground text-sm font-semibold">Hàng chờ</h2>
                <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium tabular-nums">
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
        <div className="bg-muted/30 flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed p-16 text-center">
          <div className="bg-muted flex size-12 items-center justify-center rounded-2xl">
            <CalendarClock className="text-muted-foreground/50 size-5" />
          </div>
          <div>
            <p className="text-foreground text-sm font-medium">Không có kỳ đang vận hành</p>
            <p className="text-muted-foreground mt-1 text-xs">Hãy truy cập trang vận hành để tạo kỳ quay mới.</p>
          </div>
        </div>
      )}

      <Bingo18DrawHistorySection />
    </div>
  );
}
