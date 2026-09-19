"use client";

import { StatusBadgeTone, statusBadgeToneClass } from "@/components/games/shared/status-badge-tone";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  pending: {
    label: "Chờ xử lý",
    className: statusBadgeToneClass(StatusBadgeTone.Warning),
  },
  active: {
    label: "Đang hoạt động",
    className: statusBadgeToneClass(StatusBadgeTone.Positive),
  },
  completed: {
    label: "Hoàn tất",
    className: statusBadgeToneClass(StatusBadgeTone.Success),
  },
  cancelled: {
    label: "Đã huỷ",
    className: statusBadgeToneClass(StatusBadgeTone.Negative),
  },
  void: {
    label: "Void",
    className: statusBadgeToneClass(StatusBadgeTone.Neutral),
  },
};

interface TicketStatusBadgeProps {
  status: string;
  className?: string;
}

export function TicketStatusBadge({ status, className }: TicketStatusBadgeProps) {
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
