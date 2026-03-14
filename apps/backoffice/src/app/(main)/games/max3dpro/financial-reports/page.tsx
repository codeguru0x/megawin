import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { FinancialReportsContent } from "./_lib/content";

export const metadata = {
  title: "Max 3D Pro – Báo cáo Tài chính",
};

export default function FinancialReportsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <FinancialReportsContent />
    </Suspense>
  );
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-12 w-80" />
      <Skeleton className="h-12 w-full" />
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
