"use client";

import { Suspense } from "react";

import Link from "next/link";

import { CalendarClock, ListOrdered, Loader2 } from "lucide-react";

import { Lotto535PrimaryDrawCard, Lotto535QueueDrawCard } from "@/components/games/lotto535/active-draw-card";

import { DrawHistorySection } from "./_lib/draw-history-section";
import { useCurrentDraw } from "./_lib/use-draws";

export default function AdminDrawsPage() {
  const { data, isLoading } = useCurrentDraw();

  const activeDraws = data?.activeDraws ?? [];
  const primaryDraw = activeDraws[0] ?? null;
  const queueDraws = activeDraws.slice(1);

  return (
    <div className="@container/main flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-amber-400 to-orange-500 shadow-sm">
            <CalendarClock className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-foreground text-lg font-semibold tracking-tight">Lotto 5/35 — Kỳ quay</h1>
            <p className="text-muted-foreground text-xs">Tổng quan kỳ quay hiện tại và lịch sử</p>
          </div>
        </div>
      </div>

      {/* Active Draws */}
      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-dashed p-16">
          <Loader2 className="text-muted-foreground size-8 animate-spin" />
        </div>
      ) : primaryDraw ? (
        <div className="space-y-5">
          <Lotto535PrimaryDrawCard draw={primaryDraw} />

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
                  <Lotto535QueueDrawCard key={draw.drawId} draw={draw} />
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
            <p className="text-muted-foreground mt-1 text-xs">
              Vào trang{" "}
              <Link
                prefetch={false}
                href="/games/lotto535/operations"
                className="hover:text-foreground underline underline-offset-2"
              >
                Vận hành
              </Link>{" "}
              để tạo kỳ mới.
            </p>
          </div>
        </div>
      )}

      {/* History */}
      <Suspense>
        <DrawHistorySection />
      </Suspense>
    </div>
  );
}
