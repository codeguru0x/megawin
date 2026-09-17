"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  scheduled: {
    label: "Chờ quay",
    className: "bg-muted text-muted-foreground",
  },
  active: {
    label: "Đã khoá",
    className: "bg-info text-info",
  },
  settled: {
    label: "Đã settle",
    className: "bg-profit text-profit",
  },
  void: {
    label: "Void",
    className: "bg-loss text-loss",
  },
};

interface EntryStatusBadgeProps {
  status: string;
  className?: string;
}

export function EntryStatusBadge({ status, className }: EntryStatusBadgeProps) {
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
