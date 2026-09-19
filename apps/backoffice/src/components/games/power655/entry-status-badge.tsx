"use client";

import { StatusBadgeTone, statusBadgeToneClass } from "@/components/games/shared/status-badge-tone";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  scheduled: {
    label: "Chờ quay",
    className: statusBadgeToneClass(StatusBadgeTone.Neutral),
  },
  active: {
    label: "Đã khoá",
    className: statusBadgeToneClass(StatusBadgeTone.Info),
  },
  drawn: {
    label: "Đã quay",
    className: statusBadgeToneClass(StatusBadgeTone.Published),
  },
  settled: {
    label: "Đã settle",
    className: statusBadgeToneClass(StatusBadgeTone.Success),
  },
  void: {
    label: "Vô hiệu",
    className: statusBadgeToneClass(StatusBadgeTone.Negative),
  },
};

interface EntryStatusBadgeProps {
  status: string;
  className?: string;
}

export function Power655EntryStatusBadge({ status, className }: EntryStatusBadgeProps) {
  const config = STATUS_MAP[status] ?? {
    label: status,
    className: "bg-muted text-muted-foreground",
  };

  return (
    <Badge variant="outline" className={cn("border-0", config.className, className)}>
      {config.label}
    </Badge>
  );
}
