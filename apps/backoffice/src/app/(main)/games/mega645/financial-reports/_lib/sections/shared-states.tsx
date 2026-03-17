"use client";

import { CalendarRange } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton loading cho table — match layout header + rows. */
export function TableSkeleton({ rows }: { rows: number }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="p-0">
        <div className="space-y-0">
          {[...Array(rows)].map((_, i) => (
            <div key={i} className="border-b px-5 py-3">
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Error state — có hướng dẫn tải lại. */
export function ErrorCard() {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <CalendarRange className="size-6 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-sm font-semibold">Lỗi tải dữ liệu</h3>
        <p className="mt-1 text-xs text-muted-foreground">Vui lòng tải lại trang và thử lại.</p>
      </CardContent>
    </Card>
  );
}

/** Empty state — hiển thị thông báo tuỳ chỉnh. */
export function EmptyCard({ msg }: { msg: string }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <CalendarRange className="size-6 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-sm font-semibold">Không có dữ liệu</h3>
        <p className="mt-1 text-xs text-muted-foreground">{msg}</p>
      </CardContent>
    </Card>
  );
}
