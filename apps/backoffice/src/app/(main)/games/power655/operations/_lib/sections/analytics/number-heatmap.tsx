"use client";

/**
 * Power 6/55 — Number Heatmap
 *
 * Grid 11 × 5 = 55 số chính (01-55).
 * 5-level heat intensity scale (cold → hot, amber cross-game cho hot).
 * NumberBadge: filled (heatmap grid) / soft (TopCombos + LiveFeed) / outlined.
 * NumbersWithTooltip: collapse > 7 số, dùng cho TopCombos + LiveFeed.
 */

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber, formatCurrency } from "@megawin/shared/utils";
import { BarChart2, Star, Trophy } from "lucide-react";
import { POWER655_PLAY_TYPE_LABELS } from "@megawin/game-power655/labels";
import type { PlayType } from "@megawin/game-power655/entities";
import {
  HEATMAP_BADGE_SIZE,
  HEATMAP_BADGE_TEXT,
  HEATMAP_CELL_PT,
  HEATMAP_CELL_DATA_SIZE,
  HEATMAP_CELL_SUB_SIZE,
} from "@/components/games/shared/game-number-tokens";
import { GAME_COLORS } from "@/lib/game-colors";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { TenantBreakdown } from "./analytics-panels";
import type { NumberFreq, TenantRow } from "../../types";
import type { TopComboItem } from "../../use-operations";

// ─── Power 6/55 color tokens ─────────────────────────────────────────────────
// Brand: red-600 (#dc2626) — source of truth: GAME_COLORS[GameProduct.Power655].hex

const POWER_HEX = GAME_COLORS[GameProduct.Power655].hex; // "#dc2626" red-600
const POWER_MUTED_BG = "bg-muted/40 text-muted-foreground";

// ─── Heatmap Intensity Scale ─────────────────────────────────────────────────
// 5 cấp độ intensity: cold→low→mid→warm→hot (amber cross-game cho hot).
// Staff quét mắt nhận ra ngay số "nóng" vs "lạnh" mà không cần hover.

type HeatLevel = "cold" | "low" | "mid" | "warm" | "hot";

const HEAT_BADGE_STYLES: Record<HeatLevel, string> = {
  cold: "bg-red-200/80 text-red-900 dark:bg-red-900/40 dark:text-red-200",
  low: "bg-red-300 text-red-900 dark:bg-red-800 dark:text-red-100",
  mid: "bg-red-400 text-white dark:bg-red-700",
  warm: "bg-red-600 text-white",
  hot: "bg-amber-500 text-white ring-2 ring-amber-300/50",
};

const HEAT_CELL_BG: Record<HeatLevel, string> = {
  cold: "",
  low: "",
  mid: "bg-red-50/40 dark:bg-red-950/10",
  warm: "bg-red-50/70 dark:bg-red-950/20",
  hot: "bg-amber-50/60 dark:bg-amber-950/15",
};

function getHeatLevel(count: number, maxCount: number): HeatLevel {
  if (count === 0 || maxCount === 0) return "cold";
  const ratio = count / maxCount;
  if (ratio >= 0.8) return "hot";
  if (ratio >= 0.55) return "warm";
  if (ratio >= 0.3) return "mid";
  if (ratio >= 0.1) return "low";
  return "cold";
}

// ─── Number Badge ─────────────────────────────────────────────────────────────

export type NumberBadgeVariant = "filled" | "outlined" | "soft";

/**
 * Badge tròn hiển thị số Power 6/55.
 * Size đồng nhất: size-6 (24px) — dùng shared token HEATMAP_BADGE_SIZE.
 *
 * Variants phân cấp visual hierarchy:
 * - filled (default): heatmap grid — primary, heat intensity
 * - soft: TopCombos + LiveFeed — nền nhạt, chữ đậm
 * - outlined: dự phòng — viền mỏng
 */
export function NumberBadge({
  num,
  variant = "filled",
  muted = false,
  heatLevel,
}: {
  num: string;
  variant?: NumberBadgeVariant;
  muted?: boolean;
  /** Chỉ dùng cho variant="filled" trong heatmap grid. */
  heatLevel?: HeatLevel;
}) {
  let colorClass: string;
  if (muted) {
    colorClass = POWER_MUTED_BG;
  } else if (variant === "outlined") {
    colorClass =
      "border border-red-400/70 text-red-600 bg-transparent dark:border-red-600 dark:text-red-400";
  } else if (variant === "soft") {
    colorClass = "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
  } else {
    // filled — heat intensity
    colorClass = heatLevel ? HEAT_BADGE_STYLES[heatLevel] : "bg-red-600 text-white";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold tabular-nums leading-none shrink-0",
        HEATMAP_BADGE_SIZE,
        HEATMAP_BADGE_TEXT,
        colorClass,
      )}
    >
      {num}
    </span>
  );
}

// ─── NumbersWithTooltip — collapse khi > 7 số ────────────────────────────────

const NUMBERS_VISIBLE_LIMIT = 7;

export function NumbersWithTooltip({
  numbers,
  variant = "soft",
}: {
  numbers: string[];
  variant?: "soft" | "filled";
}) {
  const needsCollapse = numbers.length > NUMBERS_VISIBLE_LIMIT;
  const visible = needsCollapse ? numbers.slice(0, NUMBERS_VISIBLE_LIMIT) : numbers;
  const hidden = needsCollapse ? numbers.slice(NUMBERS_VISIBLE_LIMIT) : [];

  return (
    <div className="flex items-center gap-1 flex-nowrap overflow-hidden">
      {visible.map((n) => (
        <NumberBadge key={n} num={n} variant={variant} />
      ))}
      {needsCollapse && (
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center justify-center rounded-full bg-muted hover:bg-muted-foreground/20 text-muted-foreground text-xs font-semibold tabular-nums px-1.5 h-6 shrink-0 cursor-default transition-colors">
                +{hidden.length}
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={6}
              showArrow={false}
              avoidCollisions
              className="bg-popover text-popover-foreground border border-border shadow-lg rounded-xl px-3 py-2.5"
            >
              <p className="text-xs text-muted-foreground mb-1.5">Tất cả {numbers.length} số</p>
              <div className="flex items-center gap-1 flex-wrap max-w-50">
                {numbers.map((n) => (
                  <NumberBadge key={n} num={n} variant={variant} />
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

// ─── Number Cell ─────────────────────────────────────────────────────────────

function NumberCell({
  n,
  col,
  row,
  totalCols,
  totalRows,
  heatLevel,
}: {
  n: NumberFreq;
  col: number;
  row: number;
  totalCols: number;
  totalRows: number;
  heatLevel: HeatLevel;
}) {
  const isEmpty = n.count === 0;
  const isLastCol = col === totalCols - 1;
  const isLastRow = row === totalRows - 1;
  const cellBg = isEmpty ? "" : HEAT_CELL_BG[heatLevel];

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "relative cursor-default select-none transition-colors hover:bg-muted/40",
              "border-r border-b border-border/50",
              isLastCol && "border-r-0",
              isLastRow && "border-b-0",
              // HEATMAP_CELL_PT (pt-8): badge size-6 (24px) absolute top-1 + khoảng cách
              HEATMAP_CELL_PT,
              "pb-1.5 px-1",
              cellBg || "bg-card",
            )}
          >
            {/* Badge số — absolute top-left, size-6 (24px) từ shared token */}
            <span className="absolute top-1 left-1">
              <NumberBadge num={n.number} muted={isEmpty} heatLevel={heatLevel} />
            </span>
            <div className="flex flex-col items-center gap-0.5">
              {isEmpty ? (
                <span className="text-[11px] text-muted-foreground/20 tabular-nums">–</span>
              ) : (
                <>
                  <span
                    className={cn(
                      HEATMAP_CELL_DATA_SIZE,
                      "font-bold tabular-nums leading-tight text-foreground",
                    )}
                  >
                    {formatCurrency(n.amount, { million: "tr", thousand: "k", decimals: 1 })}
                  </span>
                  <span
                    className={cn(
                      HEATMAP_CELL_SUB_SIZE,
                      "tabular-nums leading-none text-muted-foreground",
                    )}
                  >
                    {formatNumber(n.count)} lần
                  </span>
                </>
              )}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={6}
          showArrow={false}
          avoidCollisions
          className="bg-popover text-popover-foreground border border-border shadow-lg rounded-xl px-3 py-2.5"
        >
          <div className="flex items-center gap-2 mb-2">
            <NumberBadge num={n.number} muted={isEmpty} />
          </div>
          {isEmpty ? (
            <p className="text-xs text-muted-foreground">Chưa có cược</p>
          ) : (
            <div className="space-y-1 min-w-37">
              <div className="flex justify-between gap-8">
                <span className="text-xs text-muted-foreground">Tổng cược</span>
                <span className="text-xs font-semibold tabular-nums text-foreground">
                  {formatNumber(n.amount)}
                </span>
              </div>
              <div className="flex justify-between gap-8">
                <span className="text-xs text-muted-foreground">Lần xuất hiện</span>
                <span className="text-xs font-semibold tabular-nums text-foreground">
                  {formatNumber(n.count)}
                </span>
              </div>
              <div className="flex justify-between gap-8">
                <span className="text-xs text-muted-foreground">Lines</span>
                <span className="text-xs font-semibold tabular-nums text-foreground">
                  {formatNumber(n.lines)}
                </span>
              </div>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Main Grid — 55 số (11 × 5) ─────────────────────────────────────────────

function MainGrid({ numbers }: { numbers: NumberFreq[] }) {
  const COLS = 11;
  const TOTAL = 55;
  const byNum = new Map(numbers.map((n) => [n.number, n]));
  const totalAmount = numbers.reduce((a, n) => a + n.amount, 0);
  const totalCount = numbers.reduce((a, n) => a + n.count, 0);
  const maxCount = numbers.reduce((a, n) => Math.max(a, n.count), 0);
  const totalRows = Math.ceil(TOTAL / COLS);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex items-center justify-center size-4 rounded-full shrink-0"
            style={{ background: POWER_HEX }}
          >
            <Star className="size-2.5 text-white" />
          </span>
          <span className="text-xs font-semibold text-foreground">Số chính (01–55)</span>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatNumber(totalCount)} lượt ·{" "}
          {formatCurrency(totalAmount, { million: "tr", thousand: "k", decimals: 1 })}
        </span>
      </div>
      <div
        className="rounded-md overflow-hidden border border-border/50"
        style={{ display: "grid", gridTemplateColumns: `repeat(${COLS}, 1fr)` }}
      >
        {Array.from({ length: TOTAL }, (_, i) => {
          const num = String(i + 1).padStart(2, "0");
          const n = byNum.get(num) ?? { number: num, count: 0, lines: 0, amount: 0 };
          return (
            <NumberCell
              key={num}
              n={n}
              col={i % COLS}
              row={Math.floor(i / COLS)}
              totalCols={COLS}
              totalRows={totalRows}
              heatLevel={getHeatLevel(n.count, maxCount)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Top Combos ───────────────────────────────────────────────────────────────

function TopCombos({ combos }: { combos: TopComboItem[] }) {
  if (!combos?.length) return null;
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Trophy className="size-3.5 text-amber-500 shrink-0" />
        <span className="text-xs font-semibold text-foreground">Bộ số phổ biến nhất</span>
      </div>
      <div className="space-y-1">
        {combos.map((c) => (
          <div
            key={c.rank}
            className="flex items-center gap-2.5 rounded-lg border border-border/40 bg-muted/10 px-3 py-2"
          >
            <span className="text-sm leading-none shrink-0">
              {medals[c.rank - 1] ?? `#${c.rank}`}
            </span>
            <div className="flex-1 min-w-0 overflow-hidden">
              <NumbersWithTooltip numbers={c.mainNumbers} variant="soft" />
              <p className="text-xs text-muted-foreground mt-1">
                {POWER655_PLAY_TYPE_LABELS[c.playType as PlayType] ?? c.playType}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-semibold tabular-nums text-foreground">
                {c.entryCount} vé
              </p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {formatNumber(c.totalAmount)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Public Export ────────────────────────────────────────────────────────────

/**
 * NumberHeatmap — Power 6/55.
 * Grid 11×5 = 55 số chính (01-55).
 * Theme: purple với heat intensity 5 levels (cold→hot, amber cho hot).
 */
export function NumberHeatmap({
  mainNumbers,
  topCombos,
  tenants,
}: {
  mainNumbers: NumberFreq[];
  topCombos?: TopComboItem[];
  tenants?: TenantRow[];
}) {
  const totalBets = mainNumbers.reduce((a, n) => a + n.count, 0);

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <BarChart2 className="size-4 text-muted-foreground shrink-0" />
          <div>
            <CardTitle className="text-sm font-semibold">Phân tích số cược</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {formatNumber(totalBets)} lượt đặt · Hover để xem chi tiết
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0 space-y-4">
        <MainGrid numbers={mainNumbers} />
        {topCombos && <TopCombos combos={topCombos} />}
        {tenants && tenants.length > 0 && (
          <div className="border-t pt-3">
            <TenantBreakdown tenants={tenants} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
