import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Mega645VoidReportsContent } from "./_lib/void-content";

export default function Mega645VoidReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-52" />
              <Skeleton className="h-3.5 w-72" />
            </div>
          </div>
          <Skeleton className="h-12 w-full rounded-lg" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      }
    >
      <Mega645VoidReportsContent />
    </Suspense>
  );
}
