"use client";

import { Building2, CalendarRange, Ticket } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  const slotIds = Array.from({ length: rows }, (_, i) => `slot-${i}`);
  return (
    <Card className="gap-0 py-0">
      <CardContent className="p-0">
        <div className="space-y-0">
          {slotIds.map((id) => (
            <div key={id} className="border-b px-5 py-3">
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function ErrorCard({ message = "Vui lòng tải lại trang và thử lại." }: { message?: string }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="bg-muted flex size-12 items-center justify-center rounded-full">
          <CalendarRange className="text-muted-foreground size-6" />
        </div>
        <h3 className="mt-4 text-sm font-semibold">Lỗi tải dữ liệu</h3>
        <p className="text-muted-foreground mt-1 text-xs">{message}</p>
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
        <div className="bg-muted flex size-12 items-center justify-center rounded-full">
          <Icon className="text-muted-foreground size-6" />
        </div>
        <h3 className="mt-4 text-sm font-semibold">{message}</h3>
        {description && <p className="text-muted-foreground mt-1 text-xs">{description}</p>}
      </CardContent>
    </Card>
  );
}
