"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  scheduled: {
    label: "Đã lên lịch",
    className: "bg-muted text-muted-foreground",
  },
  salesOpen: {
    label: "Đang bán",
    className: "bg-profit text-profit",
  },
  salesClosed: {
    label: "Đóng bán",
    className: "bg-warning text-warning",
  },
  drawing: {
    label: "Đang quay",
    className: "bg-info text-info animate-pulse",
  },
  published: {
    label: "Đã có kết quả",
    className: "bg-game-max3d text-game-max3d",
  },
  settling: {
    label: "Đang kết sổ",
    className: "bg-warning text-warning animate-pulse",
  },
  settled: {
    label: "Hoàn tất",
    className: "bg-profit text-profit",
  },
  voiding: {
    label: "Đang huỷ",
    className: "bg-loss text-loss animate-pulse",
  },
  void: {
    label: "Đã huỷ",
    className: "bg-loss text-loss",
  },
};

/** Published sau khi đã từng settle (republish) — chờ kết sổ lại. Max 3D không có Jackpot. */
const AWAITING_RESETTLE = {
  label: "Chờ kết sổ lại",
  className: "bg-warning text-warning",
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
    <Badge variant="outline" className={cn("border-0", config.className, className)}>
      {config.label}
    </Badge>
  );
}
