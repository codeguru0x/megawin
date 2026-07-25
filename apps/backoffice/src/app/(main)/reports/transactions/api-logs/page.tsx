"use client";

import { Suspense } from "react";

import { FileSearch } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { SYSTEM_ICON_GRADIENT } from "@/lib/game-colors";

import { TxLogContent } from "./_components/tx-log-content";

function TxLogPageInner() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${SYSTEM_ICON_GRADIENT} shadow-sm`}
          >
            <FileSearch className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Lịch sử giao dịch</h1>
            <p className="text-xs text-muted-foreground">
              Audit log các lệnh gọi transaction đến tenant — lưu trữ 90 ngày.
            </p>
          </div>
        </div>
      </div>

      <TxLogContent />
    </div>
  );
}

export default function TxLogPage() {
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
      <TxLogPageInner />
    </Suspense>
  );
}
