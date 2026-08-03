"use client";

/**
 * Bingo 18 – Analytics Panels
 *
 * PlayTypeCard: layout 2 cột, style card đồng nhất cho cả basic và side bets.
 *   - Trái: Nhóm cơ bản (singleNum, doubleMatch, tripleMatch-specific, tripleMatch-any) — grid 2×2.
 *   - Phải: Side bets (sumTotal, bigSmallDraw) — 2 card lớn stretch full height.
 *   Cả hai cột dùng cùng card pattern: tinted bg + border + donut + KPI số.
 */

import { formatNumber } from "@megawin/shared/utils";
import { BarChart2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface PlayTypeRow {
  playType: string;
  label: string;
  entries: number;
  /** Σ betCount — số bộ cược (KHÔNG phải số board). */
  sets: number;
  pct: number;
}

// ─── Color palette ─────────────────────────────────────────────────────────────

const BASIC_STYLES: Record<
  string,
  { dot: string; text: string; fill: string; bg: string; border: string; label: string }
> = {
  singleNum: {
    dot: "bg-amber-400",
    text: "text-amber-700 dark:text-amber-400",
    fill: "#fbbf24",
    bg: "bg-amber-50/60 dark:bg-amber-950/20",
    border: "border-amber-200/60 dark:border-amber-800/40",
    label: "Một số",
  },
  doubleMatch: {
    dot: "bg-orange-500",
    text: "text-orange-700 dark:text-orange-400",
    fill: "#f97316",
    bg: "bg-orange-50/60 dark:bg-orange-950/20",
    border: "border-orange-200/60 dark:border-orange-800/40",
    label: "Đôi",
  },
  "tripleMatch-specific": {
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    fill: "#ef4444",
    bg: "bg-red-50/60 dark:bg-red-950/20",
    border: "border-red-200/60 dark:border-red-800/40",
    label: "Ba cụ thể",
  },
  "tripleMatch-any": {
    dot: "bg-rose-400",
    text: "text-rose-700 dark:text-rose-400",
    fill: "#fb7185",
    bg: "bg-rose-50/60 dark:bg-rose-950/20",
    border: "border-rose-200/60 dark:border-rose-800/40",
    label: "Ba bất kỳ",
  },
};

const SIDE_BET_STYLES: Record<
  string,
  { dot: string; text: string; fill: string; bg: string; border: string; label: string }
> = {
  sumTotal: {
    dot: "bg-cyan-500",
    text: "text-cyan-700 dark:text-cyan-400",
    fill: "#0ea5e9",
    bg: "bg-cyan-50/70 dark:bg-cyan-950/25",
    border: "border-cyan-200/60 dark:border-cyan-800/40",
    label: "Tổng điểm",
  },
  bigSmallDraw: {
    dot: "bg-teal-500",
    text: "text-teal-700 dark:text-teal-400",
    fill: "#14b8a6",
    bg: "bg-teal-50/70 dark:bg-teal-950/25",
    border: "border-teal-200/60 dark:border-teal-800/40",
    label: "Lớn / Hòa / Nhỏ",
  },
};

const BASIC_PLAY_TYPES = ["singleNum", "doubleMatch", "tripleMatch-specific", "tripleMatch-any"];
const SIDE_BET_PLAY_TYPES = ["sumTotal", "bigSmallDraw"];

// ─── Shared Mini Donut ─────────────────────────────────────────────────────────

function MiniDonut({ pct, fill, size }: { pct: number; fill: string; size: number }) {
  const stroke = size < 40 ? 4 : 5;
  const r = (size - stroke * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(pct, 0), 99.9);
  const filled = (clamped / 100) * circumference;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <title>{Math.round(pct)}%</title>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-muted/60"
      />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={fill}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference - filled}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text
        x={cx}
        y={cy + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={size < 40 ? 7.5 : 9}
        fontWeight={700}
        fill={fill}
        fontFamily="inherit"
      >
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

// ─── Basic Board Card (compact, 2×2 grid) ─────────────────────────────────────

function BasicCard({ row }: { row: PlayTypeRow }) {
  const s = BASIC_STYLES[row.playType];
  if (!s) return null;
  const isEmpty = row.sets === 0;

  return (
    <div
      className={cn(
        "rounded-xl border p-2.5 flex flex-col gap-1.5 transition-all min-w-0",
        isEmpty ? "opacity-40" : "",
        s.bg,
        s.border,
      )}
    >
      <div className="flex items-center justify-between gap-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className={cn("size-1.5 rounded-full shrink-0", s.dot)} />
          <span className={cn("text-xs font-bold truncate", s.text)}>{s.label}</span>
        </div>
        <MiniDonut pct={row.pct} fill={s.fill} size={32} />
      </div>
      <p className="text-xs font-bold tabular-nums text-foreground leading-tight">
        {formatNumber(row.sets)} bộ
      </p>
      <p className="text-xs text-muted-foreground tabular-nums leading-none">
        {formatNumber(row.entries)} entries
      </p>
    </div>
  );
}

// ─── Side Bet Card (larger, full height) ──────────────────────────────────────

function SideBetCard({ row }: { row: PlayTypeRow }) {
  const s = SIDE_BET_STYLES[row.playType] ?? SIDE_BET_STYLES.sumTotal!;
  return (
    <div
      className={cn(
        "rounded-xl border p-3.5 flex flex-col gap-2 flex-1 transition-all",
        s.bg,
        s.border,
      )}
    >
      <div className="flex items-center gap-2">
        <div className={cn("size-2 rounded-full shrink-0", s.dot)} />
        <span className={cn("text-xs font-semibold flex-1", s.text)}>{s.label}</span>
      </div>
      <div className="flex items-center gap-3 flex-1">
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold tabular-nums text-foreground leading-tight">
            {formatNumber(row.sets)}
            <span className="text-xs font-normal text-muted-foreground ml-1">bộ</span>
          </p>
          <p className="text-xs text-muted-foreground tabular-nums mt-1">
            <span className="font-semibold text-foreground">{formatNumber(row.entries)}</span>{" "}
            entries
          </p>
        </div>
        <MiniDonut pct={row.pct} fill={s.fill} size={46} />
      </div>
    </div>
  );
}

// ─── PlayType Card ─────────────────────────────────────────────────────────────

export function PlayTypeCard({ playTypes }: { playTypes: PlayTypeRow[] }) {
  const rowMap = new Map(playTypes.map((r) => [r.playType, r]));

  // Luôn hiển thị đủ 4 basic theo thứ tự (fill zero nếu chưa có data)
  const basics = BASIC_PLAY_TYPES.map(
    (pt) =>
      rowMap.get(pt) ?? {
        playType: pt,
        label: BASIC_STYLES[pt]?.label ?? pt,
        entries: 0,
        sets: 0,
        pct: 0,
      },
  );

  const sideBets = SIDE_BET_PLAY_TYPES.map(
    (pt) =>
      rowMap.get(pt) ?? {
        playType: pt,
        label: SIDE_BET_STYLES[pt]?.label ?? pt,
        entries: 0,
        sets: 0,
        pct: 0,
      },
  );

  const totalSets = playTypes.reduce((a, r) => a + r.sets, 0);

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50 shrink-0">
              <BarChart2 className="size-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Phân bổ kiểu chơi</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Cơ bản (Một số · Đôi · Ba) · Side bets (Tổng điểm · Lớn/Hòa/Nhỏ)
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
            <span className="font-semibold text-foreground">{formatNumber(totalSets)}</span>
            <span>bộ</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-4 pt-0">
        {playTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Chưa có dữ liệu</p>
        ) : (
          <div className="grid gap-4 @[640px]/main:grid-cols-[3fr_2fr]">
            {/* ── Cột trái: Basic boards grid 2×2 ── */}
            <div className="flex flex-col gap-2">
              <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground/50">
                Cơ bản — Số bộ cược
              </p>
              <div className="flex-1 grid grid-cols-2 auto-rows-fr gap-2">
                {basics.map((row) => (
                  <BasicCard key={row.playType} row={row} />
                ))}
              </div>
            </div>

            {/* ── Cột phải: Side bets stretch full height ── */}
            <div className="flex flex-col gap-2">
              <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground/50">
                Side Bets
              </p>
              <div className="flex-1 flex flex-col gap-2.5">
                {sideBets.map((row) => (
                  <SideBetCard key={row.playType} row={row} />
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
