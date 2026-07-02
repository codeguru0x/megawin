"use client";

import { Suspense } from "react";
import { History } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { SYSTEM_ICON_GRADIENT } from "@/lib/game-colors";

import { AuditLogsContent } from "./_components/audit-logs-content";

function AuditLogsPageInner() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${SYSTEM_ICON_GRADIENT} shadow-sm`}
          >
            <History className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Lịch sử thao tác
            </h1>
            <p className="text-xs text-muted-foreground">
              Nhật ký audit — ai làm gì, lên đối tượng nào, lúc nào. Lưu trữ 90 ngày.
            </p>
          </div>
        </div>
      </div>

      <AuditLogsContent />
    </div>
  );
}

export default function AuditLogsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <AuditLogsPageInner />
    </Suspense>
  );
}
