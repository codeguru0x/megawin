"use client";

import { formatNumber, formatVNDCompact } from "@megawin/shared/utils";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, Clock, FileStack } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * KPI strip cho trang "Nhật ký Dispatch" — 4 cards horizontal.
 *
 * 1. **Tổng orders** — tổng record trong range + subtotal dispatched amount.
 * 2. **Đang chờ** — pending count. Sub: retrying + stuck split.
 * 3. **Đã gửi** — dispatched count + tổng amount đã gửi.
 * 4. **Cần chú ý** — stuck + cancelled. **Clickable** khi stuck > 0 → set
 *    filter `retryMode=stuck` (bookmarkable & giảm 2 clicks cho Staff).
 *
 * Card có `value=0` được dim bớt (icon outline, text mờ) để không hút attention.
 */

interface DispatchKpiCardProps {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
  /** Dim card khi value thực sự = 0 (không phải loading). */
  dim?: boolean;
  /** Khi set, card render như button → click sẽ gọi callback. */
  onClick?: () => void;
  /** Tooltip hint cho clickable card. */
  hint?: string;
}

function DispatchKpiCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  sub,
  valueClass,
  dim,
  onClick,
  hint,
}: DispatchKpiCardProps) {
  const content = (
    <>
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg, dim && "opacity-50")}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn("text-lg font-bold tabular-nums text-foreground", dim && "text-muted-foreground", valueClass)}>
          {value}
        </p>
        <p className="truncate text-xs text-muted-foreground">{sub}</p>
      </div>
    </>
  );

  const baseClass = "flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition";

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={hint}
        className={cn(
          baseClass,
          "cursor-pointer text-left hover:border-foreground/20 hover:bg-muted/40",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {content}
      </button>
    );
  }

  return <div className={baseClass}>{content}</div>;
}

export interface DispatchKpiStripProps {
  data:
    | {
        total: number;
        pending: number;
        dispatched: number;
        cancelled: number;
        retrying: number;
        stuck: number;
        totalAmount: number;
        dispatchedAmount: number;
      }
    | undefined;
  isLoading: boolean;
  /** Click "Đang chờ" → filter `status=pending`. */
  onFocusPending?: () => void;
  /** Click "Đã gửi" → filter `status=dispatched`. */
  onFocusDispatched?: () => void;
  /** Click "Cần chú ý" → filter `retryMode=stuck`. */
  onFocusStuck?: () => void;
}

export function DispatchKpiStrip({
  data,
  isLoading,
  onFocusPending,
  onFocusDispatched,
  onFocusStuck,
}: DispatchKpiStripProps) {
  const placeholder = isLoading && !data;

  const total = data?.total ?? 0;
  const pending = data?.pending ?? 0;
  const dispatched = data?.dispatched ?? 0;
  const cancelled = data?.cancelled ?? 0;
  const retrying = data?.retrying ?? 0;
  const stuck = data?.stuck ?? 0;
  const totalAmount = data?.totalAmount ?? 0;
  const dispatchedAmount = data?.dispatchedAmount ?? 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <DispatchKpiCard
        icon={FileStack}
        iconBg="bg-indigo-100 dark:bg-indigo-900/50"
        iconColor="text-indigo-600 dark:text-indigo-400"
        label="Tổng orders"
        value={placeholder ? "—" : formatNumber(total)}
        dim={!placeholder && total === 0}
        sub={placeholder ? "\u00a0" : total === 0 ? "Chưa có order nào" : `Giá trị: ${formatVNDCompact(totalAmount)}`}
      />
      <DispatchKpiCard
        icon={Clock}
        iconBg="bg-amber-100 dark:bg-amber-900/50"
        iconColor="text-amber-600 dark:text-amber-400"
        label="Đang chờ"
        value={placeholder ? "—" : formatNumber(pending)}
        valueClass={pending > 0 ? "text-warning" : ""}
        dim={!placeholder && pending === 0}
        sub={
          placeholder
            ? "\u00a0"
            : pending === 0
              ? "Không có pending"
              : `${formatNumber(retrying)} retry · ${formatNumber(stuck)} stuck`
        }
        onClick={pending > 0 && onFocusPending ? onFocusPending : undefined}
        hint={pending > 0 ? "Bấm để lọc các orders đang chờ" : undefined}
      />
      <DispatchKpiCard
        icon={CheckCircle2}
        iconBg="bg-emerald-100 dark:bg-emerald-900/50"
        iconColor="text-emerald-600 dark:text-emerald-400"
        label="Đã gửi"
        value={placeholder ? "—" : formatNumber(dispatched)}
        valueClass={dispatched > 0 ? "text-profit" : ""}
        dim={!placeholder && dispatched === 0}
        sub={
          placeholder
            ? "\u00a0"
            : dispatched === 0
              ? "Chưa dispatch order nào"
              : `Giá trị: ${formatVNDCompact(dispatchedAmount)}`
        }
        onClick={dispatched > 0 && onFocusDispatched ? onFocusDispatched : undefined}
        hint={dispatched > 0 ? "Bấm để lọc các orders đã gửi" : undefined}
      />
      <DispatchKpiCard
        icon={AlertTriangle}
        iconBg="bg-rose-100 dark:bg-rose-900/50"
        iconColor="text-rose-600 dark:text-rose-400"
        label="Cần chú ý"
        value={placeholder ? "—" : formatNumber(stuck)}
        valueClass={stuck > 0 ? "text-loss" : ""}
        dim={!placeholder && stuck === 0 && cancelled === 0}
        sub={
          placeholder
            ? "\u00a0"
            : stuck === 0 && cancelled === 0
              ? "Không có order bất thường"
              : `${formatNumber(stuck)} stuck · ${formatNumber(cancelled)} đã huỷ`
        }
        onClick={stuck > 0 && onFocusStuck ? onFocusStuck : undefined}
        hint={stuck > 0 ? "Bấm để lọc các orders stuck" : undefined}
      />
    </div>
  );
}
