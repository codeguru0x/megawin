"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  draft: {
    label: "Nháp",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
  paid: {
    label: "Đã thanh toán",
    className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  },
  refunded: {
    label: "Hoàn tiền",
    className: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  },
  void: {
    label: "Vô hiệu",
    className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  },
  completed: {
    label: "Hoàn tất",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
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
