/**
 * AI Chat — skeleton hiển thị khi `next/dynamic` đang tải `chart-body.tsx` (chunk recharts).
 *
 * Dùng ĐÚNG chiều cao (`CHART_HEIGHT_CLASS`) của `kind` sắp render để tránh layout shift khi
 * chunk load xong và chart thật thay vào chỗ skeleton.
 */

import { Skeleton } from "@/components/ui/skeleton";
import { CHART_HEIGHT_CLASS, type ChartKind } from "@/lib/chart";

export interface ChartSkeletonProps {
  kind: ChartKind;
}

export function ChartSkeleton({ kind }: ChartSkeletonProps) {
  return <Skeleton className={`w-full rounded-md ${CHART_HEIGHT_CLASS[kind]}`} />;
}
