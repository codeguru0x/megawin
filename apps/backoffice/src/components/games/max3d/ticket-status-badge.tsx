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
    <Badge
      variant="outline"
      className={cn(
        "border-0",
        className,
        status === "pending" && "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
        status === "active" && "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
        status === "completed" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
        status === "cancelled" && "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
        status === "void" && "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
        !(
          status === "pending" ||
          status === "active" ||
          status === "completed" ||
          status === "cancelled" ||
          status === "void"
        ) && "bg-muted text-muted-foreground",
      )}
    >
      {config.label}
    </Badge>
  );
}
