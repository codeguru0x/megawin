"use client";

/**
 * Keno — Number Heatmap
 *
 * Grid 10 × 8 = 80 số (01-80).
 * Keno: chỉ hiển thị tần suất xuất hiện trong board cược (pick1-10).
 * Side bets (bigSmall, evenOdd) không có numbers cụ thể → không xuất hiện trong grid.
 * Theme: orange/amber.
 */

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber, formatCurrency } from "@megawin/shared/utils/number";
import { BarChart2, Trophy } from "lucide-react";
import type { TopComboItem } from "../../use-operations";

// ─── Keno Number Colors — orange theme ───────────────────────────────────────

const KENO_HEX = "#ea580c"; // orange-600
const KENO_BG = "bg-orange-500";
const KENO_MUTED_BG = "bg-muted/40 text-muted-foreground";

// ─── NumberBadge — Keno ───────────────────────────────────────────────────────

export function NumberBadge({
  num,
  size = "sm",
  muted = false,
}: {
  num: string;
  size?: "xs" | "sm" | "md";
  muted?: boolean;
}) {
  const sizeClass =
    size === "xs" ? "size-4 text-[9px]" : size === "sm" ? "size-5 text-[10px]" : "size-6 text-xs";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold tabular-nums leading-none shrink-0 text-white",
        sizeClass,
        muted ? KENO_MUTED_BG : KENO_BG,
      )}
    >
      {num}
    </span>
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
}: {
  n: NumberFreqItem;
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
              "pt-6 pb-1.5 px-0.5",
            )}
          >
            <span className="absolute top-1 left-1">
              <NumberBadge num={n.number} size="xs" muted={isEmpty} />
            </span>
            <div className="flex flex-col items-center gap-0.5">
              {isEmpty ? (
                <span className="text-[9px] text-muted-foreground/20 tabular-nums">–</span>
              ) : (
                <>
                  <span className="text-[9px] font-bold tabular-nums leading-tight text-foreground">
                    {formatCurrency(n.amount, { million: "tr", thousand: "k", decimals: 0 })}
                  </span>
                  <span className="text-[7px] tabular-nums leading-none text-muted-foreground">
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
            <NumberBadge num={n.number} size="sm" muted={isEmpty} />
            <span className="text-xs font-semibold">Số {n.number}</span>
          </div>
          {isEmpty ? (
            <p className="text-[11px] text-muted-foreground">Chưa có cược</p>
          ) : (
            <div className="space-y-1 min-w-[148px]">
              <div className="flex justify-between gap-8">
                <span className="text-[11px] text-muted-foreground">Lần xuất hiện</span>
                <span className="text-[11px] font-semibold tabular-nums text-foreground">
                  {formatNumber(n.count)}
                </span>
              </div>
              <div className="flex justify-between gap-8">
                <span className="text-[11px] text-muted-foreground">Tổng cược</span>
                <span className="text-[11px] font-semibold tabular-nums text-foreground">
                  {formatNumber(n.amount)}
                </span>
              </div>
              <div className="flex justify-between gap-8">
                <span className="text-[11px] text-muted-foreground">Entries</span>
                <span className="text-[11px] font-semibold tabular-nums text-foreground">
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
          <span className="text-[11px] text-muted-foreground/50">(side bets không hiện ở đây)</span>
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
          const n = byNum.get(num) ?? { number: num, count: 0, entries: 0, amount: 0 };
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

const PICK_LABELS: Record<string, string> = {
  pick1: "Pick 1",
  pick2: "Pick 2",
  pick3: "Pick 3",
  pick4: "Pick 4",
  pick5: "Pick 5",
  pick6: "Pick 6",
  pick7: "Pick 7",
  pick8: "Pick 8",
  pick9: "Pick 9",
  pick10: "Pick 10",
};

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
                {c.numbers.map((n: string) => (
                  <NumberBadge key={n} num={n} size="sm" />
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {PICK_LABELS[c.playType] ?? c.playType}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-semibold tabular-nums text-foreground">
                {c.boardCount} boards
              </p>
              <p className="text-[11px] tabular-nums text-muted-foreground">{c.entryCount} vé</p>
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
 */
export function NumberHeatmap({
  numbers,
  combos,
  drawId,
}: {
  numbers: NumberFreqItem[];
  combos?: TopComboItem[];
  drawId?: string;
}) {
  const totalBets = numbers.reduce((a, n) => a + n.count, 0);

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <BarChart2 className="size-3.5 text-muted-foreground shrink-0" />
          <div>
            <CardTitle className="text-sm font-semibold">Phân tích số cược</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {formatNumber(totalBets)} lượt đặt · Hover để xem chi tiết
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <KenoGrid numbers={numbers} />
        {combos && <TopCombos combos={combos} />}
      </CardContent>
    </Card>
  );
}
