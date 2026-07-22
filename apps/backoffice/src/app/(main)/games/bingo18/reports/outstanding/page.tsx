"use client";

import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Bingo18OutstandingContent } from "./_lib/outstanding-content";

function OutstandingPageSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-xl" />
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-3.5 w-64" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-18 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

export default function Bingo18OutstandingPage() {
  return (
    <Suspense fallback={<OutstandingPageSkeleton />}>
      <Bingo18OutstandingContent />
    </Suspense>
  );
}
