"use client";

import { StatusBadgeTone, statusBadgeToneClass } from "@/components/games/shared/status-badge-tone";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  scheduled: {
    label: "Đã lên lịch",
    className: statusBadgeToneClass(StatusBadgeTone.Neutral),
  },
  salesOpen: {
    label: "Đang bán",
    className: statusBadgeToneClass(StatusBadgeTone.Positive),
  },
  salesClosed: {
    label: "Đóng bán",
    className: statusBadgeToneClass(StatusBadgeTone.Warning),
  },
  drawing: {
    label: "Đang quay",
    className: statusBadgeToneClass(StatusBadgeTone.Info, true),
  },
  published: {
    label: "Đã có kết quả",
    className: statusBadgeToneClass(StatusBadgeTone.Published),
  },
  settling: {
    label: "Đang kết sổ",
    className: statusBadgeToneClass(StatusBadgeTone.Progress, true),
  },
  settled: {
    label: "Hoàn tất",
    className: statusBadgeToneClass(StatusBadgeTone.Success),
  },
  voiding: {
    label: "Đang huỷ",
    className: statusBadgeToneClass(StatusBadgeTone.Negative, true),
  },
  void: {
    label: "Đã huỷ",
    className: statusBadgeToneClass(StatusBadgeTone.Negative),
  },
};

/** Published sau khi đã từng settle (republish) — chờ kết sổ lại. Max 3D Pro không có Jackpot. */
const AWAITING_RESETTLE = {
  label: "Chờ kết sổ lại",
  className: statusBadgeToneClass(StatusBadgeTone.AwaitResettle),
} as const;

interface DrawStatusBadgeProps {
  status: string;
  /**
   * true khi status = published nhưng `settledAt` còn tồn tại (đã từng settle,
   * đang chờ kết sổ lại). Đổi label để staff không nhầm với publish lần đầu.
   */
  awaitingResettle?: boolean;
  className?: string;
}

export function DrawStatusBadge({ status, awaitingResettle = false, className }: DrawStatusBadgeProps) {
  const config =
    awaitingResettle && status === "published"
      ? AWAITING_RESETTLE
      : (STATUS_MAP[status] ?? {
          label: status,
          className: "bg-muted text-muted-foreground",
        });

  return (
    <Badge
      variant="outline"
      className={cn(
        "border-0",
        className,
        awaitingResettle &&
          status === "published" &&
          "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300",
        !awaitingResettle &&
          status === "scheduled" &&
          "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
        !awaitingResettle &&
          status === "salesOpen" &&
          "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
        !awaitingResettle &&
          status === "salesClosed" &&
          "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
        !awaitingResettle &&
          status === "drawing" &&
          "animate-pulse bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
        !awaitingResettle &&
          status === "published" &&
          "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
        !awaitingResettle &&
          status === "settling" &&
          "animate-pulse bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
        !awaitingResettle &&
          status === "settled" &&
          "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
        !awaitingResettle &&
          status === "voiding" &&
          "animate-pulse bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
        !awaitingResettle && status === "void" && "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
        !(awaitingResettle && status === "published") &&
          !(
            status === "scheduled" ||
            status === "salesOpen" ||
            status === "salesClosed" ||
            status === "drawing" ||
            status === "published" ||
            status === "settling" ||
            status === "settled" ||
            status === "voiding" ||
            status === "void"
          ) &&
          "bg-muted text-muted-foreground",
      )}
    >
      {config.label}
    </Badge>
  );
}
