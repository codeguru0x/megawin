import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Primitive KPI card dùng chung cho tất cả per-game financial reports.
 * Layout: icon + label ở trên, value ở giữa, sub text ở dưới.
 */
export interface KpiCardProps {
  icon: LucideIcon;
  /** Tailwind bg class cho icon container, VD: "bg-indigo-100 dark:bg-indigo-900/50" */
  iconBg: string;
  /** Tailwind text class cho icon, VD: "text-indigo-600 dark:text-indigo-400" */
  iconColor: string;
  label: string;
  value: string;
  /** Tailwind text class cho value (dùng getNetProfitColor / getPayoutRatioColor). */
  valueClass?: string;
  /** Sub text ngắn bên dưới value. Dùng khi không có subNode. */
  sub?: string;
  /** Node phức tạp thay thế sub text, VD: PayoutRatioKpiBadge. */
  subNode?: React.ReactNode;
}

export function KpiCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  valueClass,
  sub,
  subNode,
}: KpiCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className={cn("text-lg font-bold tabular-nums text-foreground", valueClass ?? "")}>
          {value}
        </p>
        {subNode}
        {sub && <p className="truncate text-[11px] tabular-nums text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}
