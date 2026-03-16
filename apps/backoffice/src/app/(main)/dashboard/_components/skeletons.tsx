import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Skeleton cho 5 Hero KPI cards — khớp layout rounded-xl border bg-card p-4.
 */
export function HeroKpisSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Skeleton cho Game Performance table */
export function GameTableSkeleton() {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <Skeleton className="h-4 w-40" />
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0">
        <div className="space-y-2.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Skeleton cho chart cards */
export function ChartSkeleton({ height = 240 }: { height?: number }) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0">
        <Skeleton className="w-full rounded" style={{ height }} />
      </CardContent>
    </Card>
  );
}
