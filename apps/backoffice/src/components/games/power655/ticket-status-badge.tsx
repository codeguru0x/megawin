"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  draft: {
    label: "Nháp",
    className: "bg-muted text-muted-foreground",
  },
  paid: {
    label: "Đã thanh toán",
    className: "bg-profit text-profit",
  },
  partial: {
    label: "Chưa xong",
    className: "bg-warning text-warning",
  },
  refunded: {
    label: "Hoàn tiền",
    className: "bg-warning text-warning",
  },
  void: {
    label: "Vô hiệu",
    className: "bg-loss text-loss",
  },
  completed: {
    label: "Hoàn tất",
    className: "bg-profit text-profit",
  },
  cancelled: {
    label: "Đã huỷ",
    className: "bg-loss text-loss",
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
    <Badge variant="outline" className={cn("border-0", config.className, className)}>
      {config.label}
    </Badge>
  );
}
