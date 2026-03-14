"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@megawin/shared/utils/number";
import { Layers } from "lucide-react";
import type { TenantRow, PlayTypeRow } from "../../types";

// ─── Color palette cho play modes ────────────────────────────────────────────

export const PLAY_MODE_COLORS: Record<
  string,
  { dot: string; text: string; fill: string; bg: string; border: string }
> = {
  // Basic mode variants
  "basic.straight": {
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    fill: "#10b981",
    bg: "bg-emerald-50/60 dark:bg-emerald-950/20",
    border: "border-emerald-200/60 dark:border-emerald-800/40",
  },
  "basic.combo3": {
    dot: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
    fill: "#3b82f6",
    bg: "bg-blue-50/60 dark:bg-blue-950/20",
    border: "border-blue-200/60 dark:border-blue-800/40",
  },
  "basic.combo6": {
    dot: "bg-violet-500",
    text: "text-violet-600 dark:text-violet-400",
    fill: "#8b5cf6",
    bg: "bg-violet-50/60 dark:bg-violet-950/20",
    border: "border-violet-200/60 dark:border-violet-800/40",
  },
  "basic.quickPick": {
    dot: "bg-teal-400",
    text: "text-teal-500 dark:text-teal-400",
    fill: "#2dd4bf",
    bg: "bg-teal-50/60 dark:bg-teal-950/20",
    border: "border-teal-200/60 dark:border-teal-800/40",
  },
  // Plus mode variants
  "plus.straight": {
    dot: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
    fill: "#f43f5e",
    bg: "bg-rose-50/60 dark:bg-rose-950/20",
    border: "border-rose-200/60 dark:border-rose-800/40",
  },
  "plus.quickPick": {
    dot: "bg-orange-400",
    text: "text-orange-500 dark:text-orange-400",
    fill: "#fb923c",
    bg: "bg-orange-50/60 dark:bg-orange-950/20",
    border: "border-orange-200/60 dark:border-orange-800/40",
  },
};

const DEFAULT_COLOR = {
  dot: "bg-muted-foreground/40",
  text: "text-muted-foreground",
  fill: "#94a3b8",
  bg: "bg-muted/10",
  border: "border-border/40",
};

// ─── Mini Pie Chart ───────────────────────────────────────────────────────────

function MiniPie({ pct, fill, size = 44 }: { pct: number; fill: string; size?: number }) {
  const r = (size - 6) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(pct, 0), 99.9);
  const filled = (clamped / 100) * circumference;
  const gap = circumference - filled;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={5}
        className="text-muted/60"
      />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={fill}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${gap}`}
        strokeDashoffset={0}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text
        x={cx}
        y={cy + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={size < 40 ? 8 : 9}
        fontWeight={700}
        fill={fill}
        fontFamily="inherit"
      >
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

// ─── PlayType Card ────────────────────────────────────────────────────────────

function PlayTypeItem({ d }: { d: PlayTypeRow }) {
  const key = `${d.playMode}.${d.playType}`;
  const color = PLAY_MODE_COLORS[key] ?? DEFAULT_COLOR;

  return (
    <div className={cn("rounded-xl border p-3.5 transition-all", color.bg, color.border)}>
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("size-2.5 rounded-full shrink-0", color.dot)} />
        <span className={cn("text-xs font-semibold truncate flex-1", color.text)}>{d.label}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-lg font-bold tabular-nums text-foreground leading-tight">
            {formatNumber(d.revenue)}
          </p>
          <div className="flex items-baseline gap-2 mt-1 flex-wrap">
            <span className="text-[11px] text-muted-foreground tabular-nums">
              <span className="font-semibold text-foreground">{formatNumber(d.lines)}</span> lines
            </span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              <span className="font-semibold text-foreground">{formatNumber(d.entries)}</span>{" "}
              entries
            </span>
          </div>
        </div>
        <MiniPie pct={d.pct} fill={color.fill} size={44} />
      </div>
    </div>
  );
}

export function PlayTypeCard({ distribution }: { distribution: PlayTypeRow[] }) {
  const totalLines = distribution.reduce((a, d) => a + d.lines, 0);
  const totalRevenue = distribution.reduce((a, d) => a + d.revenue, 0);
  const sorted = [...distribution].filter((d) => d.lines > 0).sort((a, b) => b.lines - a.lines);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="size-3.5 text-muted-foreground shrink-0" />
            <CardTitle className="text-sm font-semibold">Kiểu chơi</CardTitle>
          </div>
          <div className="flex items-center gap-2 text-xs tabular-nums">
            <span className="font-semibold text-foreground">{formatNumber(totalLines)}</span>
            <span className="text-muted-foreground">lines</span>
            <span className="text-muted-foreground">·</span>
            <span className="font-semibold text-foreground">{formatNumber(totalRevenue)}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground/50 py-4 text-center">Chưa có cược</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {sorted.map((d) => (
              <PlayTypeItem key={`${d.playMode}.${d.playType}`} d={d} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Tenant Breakdown ────────────────────────────────────────────────────────

export function TenantBreakdown({ tenants }: { tenants: TenantRow[] }) {
  if (tenants.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-primary/50 shrink-0" />
        Đại lý
      </p>
      <div className="space-y-1">
        {tenants.map((t) => (
          <div
            key={t.tenantId}
            className="grid items-center gap-x-3 rounded-lg border border-border/40 bg-muted/10 px-3 py-2"
            style={{ gridTemplateColumns: "6rem 5rem 5rem 5.5rem 1fr" }}
          >
            <span className="text-xs font-medium truncate">{t.tenantName}</span>
            <span className="text-[11px] tabular-nums text-muted-foreground text-right">
              {formatNumber(t.entries)} ent
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground text-right">
              {formatNumber(t.lines)} ln
            </span>
            <span className="text-xs tabular-nums font-semibold text-foreground text-right">
              {formatNumber(t.revenue)}
            </span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/60 transition-all"
                  style={{ width: `${t.pct}%` }}
                />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground tabular-nums w-8 text-right shrink-0">
                {t.pct.toFixed(0)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
