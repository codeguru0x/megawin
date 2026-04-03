"use client";

import { CalendarRange, Building2, Ticket } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
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

export function ErrorCard({
  message = "Vui lòng tải lại trang và thử lại.",
}: {
  message?: string;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <CalendarRange className="size-6 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-sm font-semibold">Lỗi tải dữ liệu</h3>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}

export function EmptyCard({
  icon = "calendar",
  message = "Không có dữ liệu",
  description,
}: {
  icon?: "calendar" | "building" | "ticket";
  message?: string;
  description?: string;
}) {
  const Icon = icon === "building" ? Building2 : icon === "ticket" ? Ticket : CalendarRange;
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Icon className="size-6 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-sm font-semibold">{message}</h3>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );
}
