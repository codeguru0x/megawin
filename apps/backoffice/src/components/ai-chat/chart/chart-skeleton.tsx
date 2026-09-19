/**
 * AI Chat — skeleton hiển thị khi `next/dynamic` đang tải `chart-body.tsx` (chunk recharts).
 *
 * Dùng ĐÚNG chiều cao (`CHART_HEIGHT_CLASS`) của `kind` sắp render để tránh layout shift khi
 * chunk load xong và chart thật thay vào chỗ skeleton.
 */

import { Skeleton } from "@/components/ui/skeleton";
import { ChartKind, type ChartKind as ChartKindType } from "@/lib/chart";
import { cn } from "@/lib/utils";

export interface ChartSkeletonProps {
  kind: ChartKindType;
}

export function ChartSkeleton({ kind }: ChartSkeletonProps) {
  return (
    <Skeleton
      className={cn(
        "w-full rounded-md",
        (kind === ChartKind.Line ||
          kind === ChartKind.Area ||
          kind === ChartKind.Bar ||
          kind === ChartKind.Scatter ||
          kind === ChartKind.Composed) &&
          "h-64",
        (kind === ChartKind.HBar ||
          kind === ChartKind.Pie ||
          kind === ChartKind.Donut ||
          kind === ChartKind.Radar ||
          kind === ChartKind.RadialBar) &&
          "h-72",
      )}
    />
  );
}
