import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton dùng cho `loading.tsx` của các trang vận hành (operations, hub) — layout chuẩn:
 * header + KPI strip + 1 block bảng lớn. Khớp shape chung của 7 trang operations + 2 trang hub.
 */
export function OperationsRouteSkeleton() {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 shrink-0 rounded-xl" />
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3.5 w-72" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Skeleton className="h-18 w-full rounded-xl" />
        <Skeleton className="h-18 w-full rounded-xl" />
        <Skeleton className="h-18 w-full rounded-xl" />
        <Skeleton className="h-18 w-full rounded-xl" />
        <Skeleton className="h-18 w-full rounded-xl" />
        <Skeleton className="h-18 w-full rounded-xl" />
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}

/**
 * Skeleton cho trang báo cáo (settle/outstanding/void) — header + KPI cards (3–6 cột) + 1 bảng.
 */
export function ReportRouteSkeleton() {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 shrink-0 rounded-xl" />
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-3.5 w-72" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Skeleton className="h-18 w-full rounded-xl" />
        <Skeleton className="h-18 w-full rounded-xl" />
        <Skeleton className="h-18 w-full rounded-xl" />
        <Skeleton className="h-18 w-full rounded-xl" />
        <Skeleton className="h-18 w-full rounded-xl" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

/**
 * Skeleton cho trang danh sách đơn giản (draws, config, danh mục) — header + 1 bảng/list.
 */
export function ListRouteSkeleton() {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 shrink-0 rounded-xl" />
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3.5 w-64" />
        </div>
      </div>
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}
