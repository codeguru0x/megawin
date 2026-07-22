"use client";

/**
 * Keno — Number Heatmap
 *
 * Grid 10 × 8 = 80 số (01-80).
 * Keno: chỉ hiển thị tần suất xuất hiện trong board cược (pick1-10).
 * Side bets (bigSmall, evenOdd) không có numbers cụ thể → không xuất hiện trong grid.
 * Theme: sky/cyan — brand color GAME_COLORS[GameProduct.Keno].hex (#0284c7).
 * 5-level heat intensity scale (cold → hot, amber cross-game cho hot).
 */

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber, formatCurrency } from "@megawin/shared/utils";
import { BarChart2, Trophy } from "lucide-react";
import { KenoPlayType } from "@megawin/game-keno/entities";
import { KENO_PLAY_TYPE_LABELS } from "@megawin/game-keno/labels";
import {
  HEATMAP_BADGE_SIZE,
  HEATMAP_BADGE_TEXT,
  HEATMAP_CELL_PT,
  HEATMAP_CELL_DATA_SIZE,
  HEATMAP_CELL_SUB_SIZE,
} from "@/components/games/shared/game-number-tokens";
import { GAME_COLORS } from "@/lib/game-colors";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import type { TenantRow } from "../../types";
import type { TopComboItem } from "../../use-operations";

// ─── Keno color tokens ────────────────────────────────────────────────────────
// Brand: sky-700 (#0284c7) — source of truth: GAME_COLORS[GameProduct.Keno].hex

const KENO_HEX = GAME_COLORS[GameProduct.Keno].hex; // "#0284c7" sky-700
const KENO_MUTED_BG = "bg-muted/40 text-muted-foreground";

// ─── Heatmap Intensity Scale ─────────────────────────────────────────────────
// 5 cấp độ intensity: cold→low→mid→warm→hot (amber cross-game cho hot).
// Staff quét mắt nhận ra ngay số "nóng" vs "lạnh" mà không cần hover.

type HeatLevel = "cold" | "low" | "mid" | "warm" | "hot";

const HEAT_BADGE_STYLES: Record<HeatLevel, string> = {
  cold: "bg-sky-200/80 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
  low: "bg-sky-300 text-sky-900 dark:bg-sky-800 dark:text-sky-100",
  mid: "bg-sky-400 text-white dark:bg-sky-700",
  warm: "bg-sky-600 text-white",
  hot: "bg-amber-500 text-white ring-2 ring-amber-300/50",
};

const HEAT_CELL_BG: Record<HeatLevel, string> = {
  cold: "",
  low: "",
  mid: "bg-sky-50/40 dark:bg-sky-950/10",
  warm: "bg-sky-50/70 dark:bg-sky-950/20",
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
 * Badge tròn hiển thị số Keno.
 * Size đồng nhất: size-6 (24px) — dùng shared token HEATMAP_BADGE_SIZE.
 *
 * Variants phân cấp visual hierarchy:
 * - filled (default): heatmap grid — primary, heat intensity
 * - soft: TopCombos + LiveFeed — nền nhạt, chữ đậm
 * - outlined: dự phòng
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
    colorClass = KENO_MUTED_BG;
  } else if (variant === "outlined") {
    colorClass =
      "border border-sky-400/70 text-sky-600 bg-transparent dark:border-sky-600 dark:text-sky-400";
  } else if (variant === "soft") {
    colorClass = "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300";
  } else {
    // filled — heat intensity
    colorClass = heatLevel ? HEAT_BADGE_STYLES[heatLevel] : "bg-sky-600 text-white";
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

// ─── Cell — mỗi ô tương ứng 1 số ─────────────────────────────────────────────

interface NumberFreqItem {
  number: string;
  count: number;
  entries: number;
  amount: number;
}

function NumberCell({
  n,
  col,
  row,
  totalCols,
  totalRows,
  heatLevel,
}: {
  n: NumberFreqItem;
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
              HEATMAP_CELL_PT,
              "pb-1.5 px-1",
              cellBg || "bg-card",
            )}
          >
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
                    {formatCurrency(n.amount, { million: "tr", thousand: "k", decimals: 0 })}
                  </span>
                  <span
                    className={cn(
                      HEATMAP_CELL_SUB_SIZE,
                      "tabular-nums leading-none text-muted-foreground",
                    )}
                  >
                    {formatNumber(n.count)}x
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
            <span className="text-xs font-semibold">Số {n.number}</span>
          </div>
          {isEmpty ? (
            <p className="text-xs text-muted-foreground">Chưa có cược</p>
          ) : (
            <div className="space-y-1 min-w-37">
              <div className="flex justify-between gap-8">
                <span className="text-xs text-muted-foreground">Lần xuất hiện</span>
                <span className="text-xs font-semibold tabular-nums text-foreground">
                  {formatNumber(n.count)}
                </span>
              </div>
              <div className="flex justify-between gap-8">
                <span className="text-xs text-muted-foreground">Tổng cược</span>
                <span className="text-xs font-semibold tabular-nums text-foreground">
                  {formatNumber(n.amount)}
                </span>
              </div>
              <div className="flex justify-between gap-8">
                <span className="text-xs text-muted-foreground">Entries</span>
                <span className="text-xs font-semibold tabular-nums text-foreground">
                  {formatNumber(n.entries)}
                </span>
              </div>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Grid 10 × 8 — 80 số ─────────────────────────────────────────────────────

const COLS = 10;
const TOTAL = 80;

function KenoGrid({ numbers }: { numbers: NumberFreqItem[] }) {
  const byNum = new Map(numbers.map((n) => [n.number, n]));
  const totalCount = numbers.reduce((a, n) => a + n.count, 0);
  const totalAmount = numbers.reduce((a, n) => a + n.amount, 0);
  const maxCount = numbers.reduce((a, n) => Math.max(a, n.count), 0);
  const totalRows = Math.ceil(TOTAL / COLS);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex items-center justify-center size-4 rounded-full shrink-0 text-white text-[9px] font-bold"
            style={{ background: KENO_HEX }}
          >
            K
          </span>
          <span className="text-xs font-semibold text-foreground">Số cơ bản (01–80)</span>
          <span className="text-xs text-muted-foreground/50">(side bets không hiện ở đây)</span>
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
          const n = byNum.get(num) ?? { number: num, count: 0, entries: 0, amount: 0 };
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
              <NumbersWithTooltip numbers={c.numbers as string[]} variant="soft" />
              <p className="text-xs text-muted-foreground mt-1">
                {KENO_PLAY_TYPE_LABELS[c.playType as KenoPlayType] ?? c.playType}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-semibold tabular-nums text-foreground">
                {c.boardCount} boards
              </p>
              <p className="text-xs tabular-nums text-muted-foreground">{c.entryCount} vé</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tenant Breakdown ─────────────────────────────────────────────────────────

function TenantBreakdown({ tenants }: { tenants: TenantRow[] }) {
  if (tenants.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-sky-500/60 shrink-0" />
        Đại lý
      </p>
      <div className="space-y-1">
        {tenants.map((t) => (
          <div
            key={t.tenantId}
            className="grid items-center gap-x-3 rounded-lg border border-border/40 bg-muted/10 px-3 py-2"
            style={{ gridTemplateColumns: "6rem 5rem 5rem 5.5rem 1fr" }}
          >
            <span className="text-xs font-medium truncate">{t.tenantId}</span>
            <span className="text-xs tabular-nums text-muted-foreground text-right">
              {formatNumber(t.entries)} ent
            </span>
            <span className="text-xs tabular-nums text-muted-foreground text-right">
              {formatNumber(t.players)} ng
            </span>
            <span className="text-xs tabular-nums font-semibold text-foreground text-right">
              {formatNumber(t.revenue)}
            </span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-sky-500/60 transition-all"
                  style={{ width: `${t.pct}%` }}
                />
              </div>
              <span className="text-xs font-medium text-muted-foreground tabular-nums w-8 text-right shrink-0">
                {t.pct.toFixed(0)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Public Export ────────────────────────────────────────────────────────────

/**
 * NumberHeatmap — Keno.
 * Grid 10×8 = 80 số. Chỉ pick1-10 có số cụ thể.
 * Theme: sky (brand) với 5-level heat intensity. Hot = amber cross-game.
 */
export function NumberHeatmap({
  numbers,
  combos,
  tenants,
}: {
  numbers: NumberFreqItem[];
  combos?: TopComboItem[];
  tenants?: TenantRow[];
}) {
  const totalBets = numbers.reduce((a, n) => a + n.count, 0);

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
        <KenoGrid numbers={numbers} />
        {combos && <TopCombos combos={combos} />}
        {tenants && tenants.length > 0 && (
          <div className="border-t pt-3">
            <TenantBreakdown tenants={tenants} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
