"use client";

import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Bingo18StatCardProps {
  title: string;
  value: string;
  description?: string;
  icon: LucideIcon;
  trend?: { value: number; isPositive: boolean };
  className?: string;
}

export function Bingo18StatCard({ title, value, description, icon: Icon, trend, className }: Bingo18StatCardProps) {
  return (
    <Card className={cn("gap-4 py-4", className)}>
      <CardContent className="flex items-center gap-4 px-5">
        <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
          <Icon className="text-muted-foreground size-5" />
        </div>
        <div className="flex-1 space-y-0.5">
          <p className="text-muted-foreground text-xs font-medium">{title}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-xl font-bold tabular-nums">{value}</p>
            {trend && (
              <span className={cn("text-xs font-medium", trend.isPositive ? "text-profit" : "text-loss")}>
                {trend.isPositive ? "+" : ""}
                {trend.value}%
              </span>
            )}
          </div>
          {description && <p className="text-muted-foreground text-xs">{description}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
