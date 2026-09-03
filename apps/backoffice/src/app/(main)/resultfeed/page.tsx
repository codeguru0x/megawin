"use client";

import { Suspense } from "react";

import { Radar } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { SYSTEM_ICON_GRADIENT } from "@/lib/game-colors";

import { DashboardContent } from "./_components/dashboard-content";

function ResultFeedDashboardPageInner() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${SYSTEM_ICON_GRADIENT} shadow-sm`}
          >
            <Radar className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-foreground text-lg tracking-tight">ResultFeed Dashboard</h1>
            <p className="text-muted-foreground text-xs">
              Tổng quan thu thập &amp; đồng thuận kết quả Vietlott theo game &amp; trạng thái.
            </p>
          </div>
        </div>
      </div>

      <DashboardContent />
    </div>
  );
}

export default function ResultFeedDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <ResultFeedDashboardPageInner />
    </Suspense>
  );
}
