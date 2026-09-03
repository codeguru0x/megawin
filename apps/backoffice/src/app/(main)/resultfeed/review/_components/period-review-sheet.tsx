"use client";

import type { ResultFeedGameKey } from "@megawin/resultfeed/entities";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { PeriodDetailContent } from "../../_components/period-detail-content";

export interface PeriodReviewSheetProps {
  gameKey: ResultFeedGameKey | null;
  drawPeriod: string | null;
  onClose: () => void;
}

/**
 * Sheet chi tiết 1 kỳ cho trang "Hàng đợi duyệt" — wrap {@link PeriodDetailContent} (dùng
 * chung với trang `periods` view-only) trong overlay + action verify/reject.
 */
export function PeriodReviewSheet({ gameKey, drawPeriod, onClose }: PeriodReviewSheetProps) {
  const isOpen = !!gameKey && !!drawPeriod;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-160">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="font-semibold text-lg">Chi tiết kỳ</SheetTitle>
          <SheetDescription className="text-muted-foreground text-xs">
            Chọn nguồn làm chuẩn, hoặc nhập tay khi không nguồn nào đúng.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <PeriodDetailContent gameKey={gameKey} drawPeriod={drawPeriod} onDone={onClose} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
