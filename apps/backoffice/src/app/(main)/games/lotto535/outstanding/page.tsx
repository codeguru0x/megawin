"use client";

import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { OutstandingContent } from "../_shared/outstanding";

function OutstandingPageSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-xl" />
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-3.5 w-72" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

export default function Lotto535OutstandingPage() {
  return (
    <Suspense fallback={<OutstandingPageSkeleton />}>
      <OutstandingContent />
    </Suspense>
  );
}
