"use client";

import { StatusBadgeTone, statusBadgeToneClass } from "@/components/games/shared/status-badge-tone";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  draft: {
    label: "Nháp",
    className: statusBadgeToneClass(StatusBadgeTone.Neutral),
  },
  paid: {
    label: "Đã thanh toán",
    className: statusBadgeToneClass(StatusBadgeTone.Positive),
  },
  refunded: {
    label: "Hoàn tiền",
    className: statusBadgeToneClass(StatusBadgeTone.Progress),
  },
  void: {
    label: "Vô hiệu",
    className: statusBadgeToneClass(StatusBadgeTone.Negative),
  },
  completed: {
    label: "Hoàn tất",
    className: statusBadgeToneClass(StatusBadgeTone.Success),
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
