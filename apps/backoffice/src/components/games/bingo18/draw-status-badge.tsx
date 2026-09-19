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

/** Published sau khi đã từng settle (republish) — chờ kết sổ lại. Bingo 18 không có Jackpot. */
const AWAITING_RESETTLE = {
  label: "Chờ kết sổ lại",
  className: statusBadgeToneClass(StatusBadgeTone.AwaitResettle),
} as const;

interface Bingo18DrawStatusBadgeProps {
  status: string;
  /**
   * true khi status = published nhưng `settledAt` còn tồn tại (đã từng settle,
   * đang chờ kết sổ lại). Đổi label để staff không nhầm với publish lần đầu.
   */
  awaitingResettle?: boolean;
  className?: string;
}

export function Bingo18DrawStatusBadge({ status, awaitingResettle = false, className }: Bingo18DrawStatusBadgeProps) {
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
