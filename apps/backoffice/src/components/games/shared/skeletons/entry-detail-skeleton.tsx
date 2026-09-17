"use client";

/**
 * Shared – Skeleton loading cho Entry Detail Dialog (mọi game)
 *
 * Khi user click 1 dòng để mở dialog chi tiết entry (winning entries, jackpot
 * winners, player entry list...), Dialog phải mở NGAY (không chờ API trả data)
 * để tránh cảm giác lag — data load xong thì swap nội dung thật vào chỗ
 * skeleton này. Layout xấp xỉ hình dạng thật: header icon + title, metadata
 * grid 2 cột, financial KPI 2×2, dải số kết quả, danh sách board đã chọn.
 */
import { Loader2 } from "lucide-react";

import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function EntryDetailSkeleton() {
  return (
    <div className="animate-pulse space-y-4 pr-2">
      <div className="flex items-center gap-2.5">
        <div className="bg-muted size-7 shrink-0 rounded-full" />
        <div className="bg-muted h-4 w-40 rounded" />
      </div>
      <div className="bg-muted/70 h-3 w-32 rounded" />

      <div className="bg-muted/50 grid grid-cols-2 gap-x-8 gap-y-2.5 rounded-lg px-4 py-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <div className="bg-muted h-3 w-20 rounded" />
            <div className="bg-muted h-3 w-16 rounded" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-muted/50 flex items-center gap-3 rounded-lg p-3">
            <div className="bg-muted size-8 shrink-0 rounded-md" />
            <div className="flex-1 space-y-1.5">
              <div className="bg-muted h-2.5 w-16 rounded" />
              <div className="bg-muted h-3.5 w-20 rounded" />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border p-4">
        <div className="bg-muted mb-3 h-2.5 w-20 rounded" />
        <div className="mb-4 flex flex-wrap justify-center gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-muted size-8 shrink-0 rounded-full" />
          ))}
        </div>
        <div className="mb-3 border-t" />
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-muted/60 h-9 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Header + skeleton dùng khi Dialog đã mở (open=true) nhưng entry detail
 * chưa fetch xong — thay cho việc trì hoãn mở Dialog tới khi có data
 * (gây cảm giác lag). `title` là tên game, VD "Phiếu cược — Mega 6/45".
 */
export function EntryDetailDialogLoading({ title }: { title: string }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2.5 text-base">
          <span className="bg-muted inline-flex items-center justify-center rounded-full p-1">
            <Loader2 className="text-muted-foreground size-5 shrink-0 animate-spin" />
          </span>
          {title}
        </DialogTitle>
        <DialogDescription className="text-muted-foreground text-xs">Đang tải chi tiết phiếu cược…</DialogDescription>
      </DialogHeader>
      <EntryDetailSkeleton />
    </>
  );
}
