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
  partial: {
    label: "Chưa xong",
    className: statusBadgeToneClass(StatusBadgeTone.Caution),
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
  cancelled: {
    label: "Đã huỷ",
    className: statusBadgeToneClass(StatusBadgeTone.Negative),
  },
};

interface TicketStatusBadgeProps {
  status: string;
  className?: string;
}

export function Power655TicketStatusBadge({ status, className }: TicketStatusBadgeProps) {
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
        status === "draft" && "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
        status === "paid" && "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
        status === "partial" && "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
        status === "refunded" && "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
        status === "void" && "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
        status === "completed" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
        status === "cancelled" && "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
        !(
          status === "draft" ||
          status === "paid" ||
          status === "partial" ||
          status === "refunded" ||
          status === "void" ||
          status === "completed" ||
          status === "cancelled"
        ) && "bg-muted text-muted-foreground",
      )}
    >
      {config.label}
    </Badge>
  );
}
