"use client";

import { AlertCircle, Building2, CalendarDays } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  const slotIds = Array.from({ length: rows }, (_, i) => `slot-${i}`);
  return (
    <Card className="gap-0 py-0">
      <CardContent className="p-0">
        {slotIds.map((id) => (
          <div key={id} className="border-b px-5 py-3 last:border-0">
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ErrorCard({ message = "Lỗi tải dữ liệu" }: { message?: string }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="bg-muted flex size-12 items-center justify-center rounded-full">
          <AlertCircle className="text-muted-foreground size-6" />
        </div>
        <h3 className="mt-4 text-sm font-semibold">{message}</h3>
        <p className="text-muted-foreground mt-1 text-xs">Vui lòng tải lại trang và thử lại.</p>
      </CardContent>
    </Card>
  );
}

export function EmptyCard({
  icon = "calendar",
  message = "Không có dữ liệu",
  description,
}: {
  icon?: "calendar" | "building";
  message?: string;
  description?: string;
}) {
  const Icon = icon === "building" ? Building2 : CalendarDays;
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="bg-muted flex size-12 items-center justify-center rounded-full">
          <Icon className="text-muted-foreground size-6" />
        </div>
        <h3 className="mt-4 text-sm font-semibold">{message}</h3>
        {description && <p className="text-muted-foreground mt-1 text-xs">{description}</p>}
      </CardContent>
    </Card>
  );
}
