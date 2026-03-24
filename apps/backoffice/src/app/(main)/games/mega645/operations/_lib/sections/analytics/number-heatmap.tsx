"use client";

/**
 * Mega 6/45 — Number Heatmap
 *
 * Grid 9 × 5 = 45 số chính (01-45).
 * Mega 6/45 không có số đặc biệt — chỉ có 1 grid duy nhất.
 * Theme: teal/emerald.
 */

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber, formatCurrency } from "@megawin/shared/utils";
import { BarChart2, Star, Trophy } from "lucide-react";
import {
  HEATMAP_BADGE_SIZE,
  HEATMAP_BADGE_TEXT,
  HEATMAP_CELL_PT,
  HEATMAP_CELL_DATA_SIZE,
  HEATMAP_CELL_SUB_SIZE,
} from "@/components/games/shared/game-number-tokens";
import { PlayType } from "@megawin/game-mega645/entities";
import { MEGA645_PLAY_TYPE_LABELS } from "@megawin/game-mega645/labels";
import { TenantBreakdown } from "./analytics-panels";
import type { NumberFreq, TenantRow } from "../../types";
import type { TopComboItem } from "../../use-operations";

// ─── Mega645 Number colors ────────────────────────────────────────────────────

const MEGA_MAIN_HEX = "#0d9488"; // teal-600
const MEGA_MAIN_BG = "bg-teal-600";
const MEGA_MUTED_BG = "bg-muted/40 text-muted-foreground";

// ─── Number Badge ─────────────────────────────────────────────────────────────

/**
 * Badge tròn hiển thị số Mega 6/45.
 * Size đồng nhất: size-6 (24px) — dùng shared token HEATMAP_BADGE_SIZE.
 */
export function NumberBadge({ num, muted = false }: { num: string; muted?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold tabular-nums leading-none shrink-0 text-white",
        HEATMAP_BADGE_SIZE,
        HEATMAP_BADGE_TEXT,
        muted ? MEGA_MUTED_BG : MEGA_MAIN_BG,
      )}
    >
      {num}
    </span>
  );
}

// ─── Number Cell ─────────────────────────────────────────────────────────────

function NumberCell({
  n,
  col,
  row,
  totalCols,
  totalRows,
}: {
  n: NumberFreq;
  col: number;
  row: number;
  totalCols: number;
  totalRows: number;
}) {
  const isEmpty = n.count === 0;
  const isLastCol = col === totalCols - 1;
  const isLastRow = row === totalRows - 1;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "relative cursor-default select-none transition-colors bg-card hover:bg-muted/40",
              "border-r border-b border-border/50",
              isLastCol && "border-r-0",
              isLastRow && "border-b-0",
              // HEATMAP_CELL_PT (pt-8): badge size-6 (24px) absolute top-1 + khoảng cách
              HEATMAP_CELL_PT,
              "pb-1.5 px-1",
            )}
          >
            <span className="absolute top-1 left-1">
              <NumberBadge num={n.number} muted={isEmpty} />
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
            <p className="text-[11px] text-muted-foreground">Chưa có cược</p>
          ) : (
            <div className="space-y-1 min-w-[148px]">
              <div className="flex justify-between gap-8">
                <span className="text-[11px] text-muted-foreground">Tổng cược</span>
                <span className="text-[11px] font-semibold tabular-nums text-foreground">
                  {formatNumber(n.amount)}
                </span>
              </div>
              <div className="flex justify-between gap-8">
                <span className="text-[11px] text-muted-foreground">Lần xuất hiện</span>
                <span className="text-[11px] font-semibold tabular-nums text-foreground">
                  {formatNumber(n.count)}
                </span>
              </div>
              <div className="flex justify-between gap-8">
                <span className="text-[11px] text-muted-foreground">Lines</span>
                <span className="text-[11px] font-semibold tabular-nums text-foreground">
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

// ─── Main Grid — 45 số (9 × 5) ──────────────────────────────────────────────

function MainGrid({ numbers }: { numbers: NumberFreq[] }) {
  const COLS = 9;
  const TOTAL = 45;
  const byNum = new Map(numbers.map((n) => [n.number, n]));
  const totalAmount = numbers.reduce((a, n) => a + n.amount, 0);
  const totalCount = numbers.reduce((a, n) => a + n.count, 0);
  const totalRows = Math.ceil(TOTAL / COLS);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex items-center justify-center size-4 rounded-full shrink-0"
            style={{ background: MEGA_MAIN_HEX }}
          >
            <Star className="size-2.5 text-white" />
          </span>
          <span className="text-xs font-semibold text-foreground">Số chính (01–45)</span>
        </div>
        <span className="text-[11px] tabular-nums text-muted-foreground">
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
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 flex-wrap">
                {c.mainNumbers.map((n) => (
                  <NumberBadge key={n} num={n} />
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {MEGA645_PLAY_TYPE_LABELS[c.playType as PlayType] ?? c.playType}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-semibold tabular-nums text-foreground">
                {c.entryCount} vé
              </p>
              <p className="text-[11px] tabular-nums text-muted-foreground">
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
 * NumberHeatmap — Mega 6/45.
 * Chỉ có mainNumbers (01-45), không có specialNumbers.
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
