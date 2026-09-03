"use client";

import Link from "next/link";

import { CalendarClock, ListOrdered, Loader2 } from "lucide-react";

import { Max3dproPrimaryDrawCard, Max3dproQueueDrawCard } from "@/components/games/max3dpro/active-draw-card";

import { useGameConfig } from "../config/game/_lib/use-game-config";
import { DrawHistorySection } from "./_lib/draw-history-section";
import { useCurrentDraw } from "./_lib/use-draws";

export default function Max3dproDrawsPage() {
  const { data, isLoading } = useCurrentDraw();
  const { data: gameConfig } = useGameConfig();

  const activeDraws = data?.activeDraws ?? [];
  const primaryDraw = activeDraws[0] ?? null;
  const queueDraws = activeDraws.slice(1);

  const drawTimes = gameConfig?.play.drawTimes ?? ["18:00"];
  const drawsPerDay = gameConfig?.play.drawsPerDay ?? 1;

  return (
    <div className="@container/main flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-pink-500 to-pink-600 shadow-sm">
            <CalendarClock className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Max 3D Pro — Kỳ quay</h1>
            <p className="text-xs text-muted-foreground">
              {drawsPerDay} kỳ/ngày ({drawTimes.join(" & ")}). T3/T5/T7 hàng tuần.
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-dashed p-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : primaryDraw ? (
        <div className="space-y-5">
          <Max3dproPrimaryDrawCard draw={primaryDraw} />

          {queueDraws.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ListOrdered className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Hàng chờ</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                  {queueDraws.length} kỳ
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {queueDraws.map((draw) => (
                  <Max3dproQueueDrawCard key={draw.drawId} draw={draw} />
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
            <p className="text-sm font-medium text-foreground">Không có kỳ đang vận hành</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Vào trang{" "}
              <Link prefetch={false} href="/games/max3dpro/operations" className="underline underline-offset-2 hover:text-foreground">
                Vận hành
              </Link>{" "}
              để tạo kỳ mới.
            </p>
          </div>
        </div>
      )}

      <DrawHistorySection />
    </div>
  );
}
