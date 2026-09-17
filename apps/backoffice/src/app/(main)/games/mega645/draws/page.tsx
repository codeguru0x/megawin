"use client";

/**
 * Mega 6/45 — Trang Kỳ quay
 *
 * Tổng quan kỳ quay đang active và lịch sử kỳ quay.
 * Link đến trang vận hành để quản lý chi tiết từng kỳ.
 *
 * Mega 6/45: 1 kỳ/ngày, không có split cycle.
 * Theme: teal/emerald.
 */
import Link from "next/link";

import { CalendarClock, ListOrdered, Loader2 } from "lucide-react";

import { Mega645PrimaryDrawCard, Mega645QueueDrawCard } from "@/components/games/mega645/active-draw-card";

import { DrawHistorySection } from "./_lib/draw-history-section";
import { useCurrentDraw } from "./_lib/use-draws";

export default function Mega645DrawsPage() {
  const { data, isLoading } = useCurrentDraw();

  const activeDraws = data?.activeDraws ?? [];
  const primaryDraw = activeDraws[0] ?? null;
  const queueDraws = activeDraws.slice(1);

  return (
    <div className="@container/main flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="from-game-mega645 to-game-mega645-muted flex size-9 items-center justify-center rounded-xl bg-linear-to-br shadow-sm">
          <CalendarClock className="size-4.5 text-white" />
        </div>
        <div>
          <h1 className="text-foreground text-lg font-semibold tracking-tight">Mega 6/45 — Kỳ quay</h1>
          <p className="text-muted-foreground text-xs">Tổng quan kỳ quay hiện tại và lịch sử</p>
        </div>
      </div>

      {/* Active Draws */}
      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-dashed p-16">
          <Loader2 className="text-muted-foreground size-8 animate-spin" />
        </div>
      ) : primaryDraw ? (
        <div className="space-y-5">
          <Mega645PrimaryDrawCard draw={primaryDraw} />

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
                  <Mega645QueueDrawCard key={draw.drawId} draw={draw} />
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
                href="/games/mega645/operations"
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
      <DrawHistorySection />
    </div>
  );
}
