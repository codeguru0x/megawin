"use client";

import { Suspense } from "react";

import { FileSearch } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { SYSTEM_ICON_GRADIENT } from "@/lib/game-colors";

import { PeriodLookupContent } from "./_components/period-lookup-content";

function PeriodsPageInner() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex items-center gap-3">
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${SYSTEM_ICON_GRADIENT} shadow-sm`}
        >
          <FileSearch className="size-4.5 text-white" />
        </div>
        <div>
          <h1 className="font-semibold text-foreground text-lg tracking-tight">Tra cứu kỳ</h1>
          <p className="text-muted-foreground text-xs">
            Xem chi tiết consensus + toàn bộ observations của 1 kỳ (view-only).
          </p>
        </div>
      </div>

      <PeriodLookupContent />
    </div>
  );
}

export default function PeriodsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-24 w-full" />
        </div>
      }
    >
      <PeriodsPageInner />
    </Suspense>
  );
}
