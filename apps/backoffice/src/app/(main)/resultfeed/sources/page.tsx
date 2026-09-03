"use client";

import { Suspense } from "react";

import { Settings2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { SYSTEM_ICON_GRADIENT } from "@/lib/game-colors";

import { SourcesContent } from "./_components/sources-content";

function SourcesPageInner() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex items-center gap-3">
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${SYSTEM_ICON_GRADIENT} shadow-sm`}
        >
          <Settings2 className="size-4.5 text-white" />
        </div>
        <div>
          <h1 className="font-semibold text-foreground text-lg tracking-tight">Nguồn dữ liệu</h1>
          <p className="text-muted-foreground text-xs">Quản lý vai trò, trọng số tin cậy, và kill-switch từng nguồn.</p>
        </div>
      </div>

      <SourcesContent />
    </div>
  );
}

export default function SourcesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <SourcesPageInner />
    </Suspense>
  );
}
