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
  settled: {
    label: "Đã settle",
    className: statusBadgeToneClass(StatusBadgeTone.Success),
  },
  void: {
    label: "Void",
    className: statusBadgeToneClass(StatusBadgeTone.Negative),
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
    <Badge
      variant="outline"
      className={cn(
        "border-0",
        className,
        status === "scheduled" && "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
        status === "active" && "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
        status === "settled" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
        status === "void" && "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
        !(status === "scheduled" || status === "active" || status === "settled" || status === "void") &&
          "bg-muted text-muted-foreground",
      )}
    >
      {config.label}
    </Badge>
  );
}
