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
import { CalendarClock, Loader2, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";

import { useCurrentDraw } from "./_lib/use-draws";
import {
  Mega645PrimaryDrawCard,
  Mega645QueueDrawCard,
} from "@/components/games/mega645/active-draw-card";
import { DrawHistorySection } from "./_lib/draw-history-section";

export default function Mega645DrawsPage() {
  const { data, isLoading } = useCurrentDraw();

  const activeDraws = data?.activeDraws ?? [];
  const primaryDraw = activeDraws[0] ?? null;
  const queueDraws = activeDraws.slice(1);

  return (
    <div className="@container/main flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-teal-500 to-teal-600 shadow-sm">
            <CalendarClock className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Mega 6/45 — Kỳ quay
            </h1>
            <p className="text-xs text-muted-foreground">Tổng quan kỳ quay hiện tại và lịch sử</p>
          </div>
        </div>
        <Button size="sm" variant="outline" asChild>
          <Link href="/games/mega645/operations">Trang vận hành</Link>
        </Button>
      </div>

      {/* Active Draws */}
      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-dashed p-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : primaryDraw ? (
        <div className="space-y-5">
          <Mega645PrimaryDrawCard draw={primaryDraw} />

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
                  <Mega645QueueDrawCard key={draw.drawId} draw={draw} />
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
              <Link
                href="/games/mega645/operations"
                className="underline underline-offset-2 hover:text-foreground"
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
