"use client";

import { Suspense } from "react";

import { ClipboardCheck } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { SYSTEM_ICON_GRADIENT } from "@/lib/game-colors";

import { ReviewContent } from "./_components/review-content";

function ReviewPageInner() {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex items-center gap-3">
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${SYSTEM_ICON_GRADIENT} shadow-sm`}
        >
          <ClipboardCheck className="size-4.5 text-white" />
        </div>
        <div>
          <h1 className="font-semibold text-foreground text-lg tracking-tight">Hàng đợi duyệt</h1>
          <p className="text-muted-foreground text-xs">Các kỳ có nguồn lệch nhau — cần người xác nhận kết quả.</p>
        </div>
      </div>

      <ReviewContent />
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <ReviewPageInner />
    </Suspense>
  );
}
