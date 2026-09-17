"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  scheduled: {
    label: "Đã lên lịch",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
  salesOpen: {
    label: "Đang bán",
    className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  },
  salesClosed: {
    label: "Đóng bán",
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  },
  drawing: {
    label: "Đang quay",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 animate-pulse",
  },
  published: {
    label: "Đã có kết quả",
    className: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  },
  settling: {
    label: "Đang kết sổ",
    className: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 animate-pulse",
  },
  settled: {
    label: "Hoàn tất",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  },
  voiding: {
    label: "Đang huỷ",
    className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 animate-pulse",
  },
  void: {
    label: "Đã huỷ",
    className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  },
};

/** Published sau khi đã từng settle (republish) — chờ kết sổ lại. Keno không có Jackpot. */
const AWAITING_RESETTLE = {
  label: "Chờ kết sổ lại",
  className: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300",
} as const;

interface KenoDrawStatusBadgeProps {
  status: string;
  /**
   * true khi status = published nhưng `settledAt` còn tồn tại (đã từng settle,
   * đang chờ kết sổ lại). Đổi label để staff không nhầm với publish lần đầu.
   */
  awaitingResettle?: boolean;
  className?: string;
}

export function KenoDrawStatusBadge({ status, awaitingResettle = false, className }: KenoDrawStatusBadgeProps) {
  const config =
    awaitingResettle && status === "published"
      ? AWAITING_RESETTLE
      : (STATUS_MAP[status] ?? {
          label: status,
          className: "bg-muted text-muted-foreground",
        });

  return (
    <Badge variant="outline" className={cn("border-0", config.className, className)}>
      {config.label}
    </Badge>
  );
}
