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
  drawn: {
    label: "Đã quay",
    className: "bg-game-max3d text-game-max3d",
  },
  settled: {
    label: "Đã settle",
    className: "bg-profit text-profit",
  },
  void: {
    label: "Vô hiệu",
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
