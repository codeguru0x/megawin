"use client";

/**
 * Lotto 5/35 — Number Heatmap (+ combo lookup)
 *
 * Main grid 7 × 5 = 35 số chính (01-35), theme amber. Special grid 4 × 3 = 12 số
 * đặc biệt (01-12), theme orange. 5-level heat intensity (cold → hot, amber cho
 * hot), theo DÒNG TIỀN mỗi số. Cả 2 bảng LUÔN cho click chọn số, phục vụ tra cứu
 * combo (khác Power 6/55: 2 chiều số riêng — dialog chọn main + special).
 *
 * PlayType TỰ SUY theo số lượng main+special đã chọn (4+1=mainCover4, 5+1=standard,
 * 6-15+1=mainCoverN, 5+2..12=specialCover); dialog validate qua `validateSelection`
 * trước khi tra (mirror Power 6/55 analysis §3.10(7)).
 *
 * Export dùng chung: `NumberBadge` (filled/soft/outlined), `NumbersWithTooltip`
 * (collapse > 7 số) — analytics-panels + live-feed import.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { PlayType } from "@megawin/game-lotto535/entities";
import { validateSelection } from "@megawin/game-lotto535/rules";
import { formatCurrency, formatNumber } from "@megawin/shared/utils";
import { BarChart2, MoreHorizontal, Search, Star, X } from "lucide-react";

import {
  HEATMAP_BADGE_SIZE,
  HEATMAP_BADGE_TEXT,
  HEATMAP_CELL_DATA_SIZE,
  HEATMAP_CELL_PT,
  HEATMAP_CELL_SUB_SIZE,
} from "@/components/games/shared/game-number-tokens";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { NumberFreqItem } from "../../types";
import { useComboLookup } from "../../use-operations";

// ─── Lotto 5/35 color tokens ─────────────────────────────────────────────────

const LOTTO_MAIN_HEX = "#d97706"; // amber-600
const LOTTO_SPECIAL_HEX = "#ea580c"; // orange-600
const LOTTO_MUTED_BG = "bg-muted/40 text-muted-foreground";

// ─── Heatmap Intensity Scale ─────────────────────────────────────────────────

type HeatLevel = "cold" | "low" | "mid" | "warm" | "hot";

const HEAT_BADGE_STYLES_MAIN: Record<HeatLevel, string> = {
  cold: "bg-amber-200/80 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  low: "bg-amber-300 text-amber-900 dark:bg-amber-800 dark:text-amber-100",
  mid: "bg-amber-400 text-white dark:bg-amber-700",
  warm: "bg-amber-600 text-white",
  hot: "bg-amber-500 text-white ring-2 ring-amber-300/50",
};

const HEAT_BADGE_STYLES_SPECIAL: Record<HeatLevel, string> = {
  cold: "bg-orange-200/80 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200",
  low: "bg-orange-300 text-orange-900 dark:bg-orange-800 dark:text-orange-100",
  mid: "bg-orange-400 text-white dark:bg-orange-700",
  warm: "bg-orange-600 text-white",
  hot: "bg-amber-500 text-white ring-2 ring-amber-300/50",
};

const HEAT_CELL_BG: Record<HeatLevel, string> = {
  cold: "",
  low: "",
  mid: "bg-amber-50/40 dark:bg-amber-950/10",
  warm: "bg-amber-50/70 dark:bg-amber-950/20",
  hot: "bg-amber-50/60 dark:bg-amber-950/15",
};

function getHeatLevel(amount: number, maxAmount: number): HeatLevel {
  if (amount === 0 || maxAmount === 0) return "cold";
  const ratio = amount / maxAmount;
  if (ratio >= 0.8) return "hot";
  if (ratio >= 0.55) return "warm";
  if (ratio >= 0.3) return "mid";
  if (ratio >= 0.1) return "low";
  return "cold";
}

// ─── Number Badge ─────────────────────────────────────────────────────────────

export type NumberBadgeVariant = "filled" | "outlined" | "soft";

/**
 * Badge tròn hiển thị số Lotto 5/35. Size đồng nhất: size-6 (24px) — shared token
 * HEATMAP_BADGE_SIZE. `ballVariant` phân biệt số chính (amber) vs số đặc biệt (orange).
 *
 * Variants: filled (heatmap grid, heat intensity) · soft (TopCombos + LiveFeed) ·
 * outlined (dự phòng).
 */
export function NumberBadge({
  num,
  variant = "filled",
  ballVariant = "main",
  muted = false,
  heatLevel,
  selected = false,
}: {
  num: string;
  variant?: NumberBadgeVariant;
  /** Phân biệt số chính vs số đặc biệt cho màu sắc. */
  ballVariant?: "main" | "special";
  muted?: boolean;
  /** Chỉ dùng cho variant="filled" trong heatmap grid. */
  heatLevel?: HeatLevel;
  /** Đang được chọn trong chế độ tra cứu — badge tô đậm theo `ballVariant`. */
  selected?: boolean;
}) {
  let colorClass: string;
  if (selected) {
    colorClass =
      ballVariant === "special"
        ? "bg-orange-600 text-white ring-2 ring-orange-300/60"
        : "bg-amber-600 text-white ring-2 ring-amber-300/60";
  } else if (muted) {
    colorClass = LOTTO_MUTED_BG;
  } else if (variant === "outlined") {
    colorClass =
      ballVariant === "special"
        ? "border border-orange-400/70 text-orange-600 bg-transparent dark:border-orange-600 dark:text-orange-400"
        : "border border-amber-400/70 text-amber-600 bg-transparent dark:border-amber-600 dark:text-amber-400";
  } else if (variant === "soft") {
    colorClass =
      ballVariant === "special"
        ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
        : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  } else {
    // filled — heat intensity
    const styles = ballVariant === "special" ? HEAT_BADGE_STYLES_SPECIAL : HEAT_BADGE_STYLES_MAIN;
    colorClass = heatLevel ? styles[heatLevel] : "bg-amber-600 text-white";
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
  ballVariant = "main",
}: {
  numbers: string[];
  variant?: "soft" | "filled";
  ballVariant?: "main" | "special";
}) {
  const needsCollapse = numbers.length > NUMBERS_VISIBLE_LIMIT;
  const visible = needsCollapse ? numbers.slice(0, NUMBERS_VISIBLE_LIMIT) : numbers;
  const hidden = needsCollapse ? numbers.slice(NUMBERS_VISIBLE_LIMIT) : [];

  return (
    <div className="flex items-center gap-1 flex-nowrap overflow-hidden">
      {visible.map((n) => (
        <NumberBadge key={n} num={n} variant={variant} ballVariant={ballVariant} />
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
                  <NumberBadge key={n} num={n} variant={variant} ballVariant={ballVariant} />
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

function NumberCell({
  n,
  ballVariant,
  col,
  row,
  totalCols,
  totalRows,
  heatLevel,
  selected,
  onToggle,
}: {
  n: NumberFreqItem;
  ballVariant: "main" | "special";
  col: number;
  row: number;
  totalCols: number;
  totalRows: number;
  heatLevel: HeatLevel;
  /** Đang được chọn — ô hiện ring nổi bật theo `ballVariant`. */
  selected: boolean;
  onToggle: (num: string) => void;
}) {
  const isEmpty = n.sets === 0;
  const isLastCol = col === totalCols - 1;
  const isLastRow = row === totalRows - 1;
  const cellBg = isEmpty ? "" : HEAT_CELL_BG[heatLevel];
  const hoverBg =
    ballVariant === "special"
      ? "hover:bg-orange-100/50 dark:hover:bg-orange-950/30"
      : "hover:bg-amber-100/50 dark:hover:bg-amber-950/30";
  const selectedBg =
    ballVariant === "special"
      ? "bg-orange-100/80 ring-2 ring-inset ring-orange-500 dark:bg-orange-900/40"
      : "bg-amber-100/80 ring-2 ring-inset ring-amber-500 dark:bg-amber-900/40";

  const cellClass = cn(
    "relative select-none transition-colors text-left w-full",
    "border-r border-b border-border/50",
    isLastCol && "border-r-0",
    isLastRow && "border-b-0",
    HEATMAP_CELL_PT,
    "pb-1.5 px-1",
    cellBg || "bg-card",
    "cursor-pointer",
    hoverBg,
    selected && selectedBg,
  );

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Bảng số LUÔN cho chọn → <button> (a11y: aria-pressed + keyboard native). */}
          <button type="button" className={cellClass} onClick={() => onToggle(n.number)} aria-pressed={selected}>
            <span className="absolute top-1 left-1">
              <NumberBadge
                num={n.number}
                muted={isEmpty && !selected}
                ballVariant={ballVariant}
                heatLevel={heatLevel}
                selected={selected}
              />
            </span>
            <div className="flex flex-col items-center gap-0.5">
              {isEmpty ? (
                <span className="text-[11px] text-muted-foreground/20 tabular-nums">–</span>
              ) : (
                <>
                  {/* Dòng tiền — giá trị chính (lớp heat nền theo giá trị này). */}
                  <span className={cn(HEATMAP_CELL_DATA_SIZE, "font-bold tabular-nums leading-tight text-foreground")}>
                    {formatCurrency(n.amount, { million: "tr", thousand: "k", decimals: 0 })}
                  </span>
                  <span className={cn(HEATMAP_CELL_SUB_SIZE, "tabular-nums leading-none text-muted-foreground")}>
                    {formatNumber(n.sets)}x
                  </span>
                </>
              )}
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={6}
          showArrow={false}
          avoidCollisions
          className="bg-popover text-popover-foreground border border-border shadow-lg rounded-xl px-3 py-2.5"
        >
          <div className="flex items-center gap-2 mb-2">
            <NumberBadge num={n.number} muted={isEmpty} ballVariant={ballVariant} />
            <span className="text-xs font-semibold">Số {n.number}</span>
          </div>
          {isEmpty ? (
            <p className="text-xs text-muted-foreground">Chưa có cược</p>
          ) : (
            <div className="space-y-1 min-w-37">
              <div className="flex justify-between gap-8">
                <span className="text-xs text-muted-foreground">Số bộ cược chứa số</span>
                <span className="text-xs font-semibold tabular-nums text-foreground">{formatNumber(n.sets)}</span>
              </div>
              <div className="flex justify-between gap-8">
                <span className="text-xs text-muted-foreground">Tổng cược</span>
                <span className="text-xs font-semibold tabular-nums text-foreground">{formatNumber(n.amount)}</span>
              </div>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Main Grid — 35 số chính (7 × 5) ─────────────────────────────────────────

const MAIN_COLS = 7;
const MAIN_TOTAL = 35;
/** Ngưỡng dữ liệu thưa — dưới đây heatmap chưa có ý nghĩa thống kê, hiện hint. */
const SPARSE_DATA_THRESHOLD = 10;

function MainGrid({
  numbers,
  selected,
  onToggle,
}: {
  numbers: NumberFreqItem[];
  /** Số chính đang chọn — ô đã chọn có ring amber. Bảng LUÔN cho click chọn. */
  selected: Set<string>;
  onToggle: (num: string) => void;
}) {
  const byNum = new Map(numbers.map((n) => [n.number, n]));
  const totalSets = numbers.reduce((a, n) => a + n.sets, 0);
  const totalAmount = numbers.reduce((a, n) => a + n.amount, 0);
  const maxAmount = numbers.reduce((a, n) => Math.max(a, n.amount), 0);
  const totalRows = Math.ceil(MAIN_TOTAL / MAIN_COLS);
  const isSparse = totalSets > 0 && totalSets < SPARSE_DATA_THRESHOLD;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex items-center justify-center size-4 rounded-full shrink-0"
            style={{ background: LOTTO_MAIN_HEX }}
          >
            <Star className="size-2.5 text-white" />
          </span>
          <span className="text-xs font-semibold text-foreground">Số chính (01–35)</span>
        </div>
        <div className="flex items-center gap-3 text-xs tabular-nums">
          <span className="text-muted-foreground">
            Số bộ <span className="font-semibold text-foreground">{formatNumber(totalSets)}</span>
          </span>
          <span className="text-muted-foreground">
            Dòng tiền{" "}
            <span className="font-semibold text-foreground">
              {formatCurrency(totalAmount, { million: "tr", thousand: "k", decimals: 1 })}
            </span>
          </span>
        </div>
      </div>
      <div
        className="rounded-md overflow-hidden border border-border/50"
        style={{ display: "grid", gridTemplateColumns: `repeat(${MAIN_COLS}, 1fr)` }}
      >
        {Array.from({ length: MAIN_TOTAL }, (_, i) => {
          const num = String(i + 1).padStart(2, "0");
          const n = byNum.get(num) ?? { number: num, sets: 0, amount: 0, boards: 0 };
          return (
            <NumberCell
              key={num}
              n={n}
              ballVariant="main"
              col={i % MAIN_COLS}
              row={Math.floor(i / MAIN_COLS)}
              totalCols={MAIN_COLS}
              totalRows={totalRows}
              heatLevel={getHeatLevel(n.amount, maxAmount)}
              selected={selected.has(num)}
              onToggle={onToggle}
            />
          );
        })}
      </div>
      {isSparse && (
        <p className="text-[11px] text-muted-foreground/60 italic">
          Dữ liệu còn ít ({formatNumber(totalSets)} bộ) — heatmap sẽ rõ hơn khi có thêm cược.
        </p>
      )}
    </div>
  );
}

// ─── Special Grid — 12 số đặc biệt (4 × 3) ──────────────────────────────────

const SPECIAL_COLS = 4;
const SPECIAL_TOTAL = 12;

function SpecialGrid({
  numbers,
  selected,
  onToggle,
}: {
  numbers: NumberFreqItem[];
  /** Số ĐB đang chọn — ô đã chọn có ring orange. Bảng LUÔN cho click chọn. */
  selected: Set<string>;
  onToggle: (num: string) => void;
}) {
  const byNum = new Map(numbers.map((n) => [n.number, n]));
  const totalSets = numbers.reduce((a, n) => a + n.sets, 0);
  const totalAmount = numbers.reduce((a, n) => a + n.amount, 0);
  const maxAmount = numbers.reduce((a, n) => Math.max(a, n.amount), 0);
  const totalRows = Math.ceil(SPECIAL_TOTAL / SPECIAL_COLS);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex items-center justify-center size-4 rounded-full shrink-0"
            style={{ background: LOTTO_SPECIAL_HEX }}
          >
            <Star className="size-2.5 text-white" />
          </span>
          <span className="text-xs font-semibold text-foreground">Số đặc biệt (01–12)</span>
        </div>
        <div className="flex items-center gap-3 text-xs tabular-nums">
          <span className="text-muted-foreground">
            Số bộ <span className="font-semibold text-foreground">{formatNumber(totalSets)}</span>
          </span>
          <span className="text-muted-foreground">
            Dòng tiền{" "}
            <span className="font-semibold text-foreground">
              {formatCurrency(totalAmount, { million: "tr", thousand: "k", decimals: 1 })}
            </span>
          </span>
        </div>
      </div>
      <div
        className="rounded-md overflow-hidden border border-border/50"
        style={{ display: "grid", gridTemplateColumns: `repeat(${SPECIAL_COLS}, 1fr)` }}
      >
        {Array.from({ length: SPECIAL_TOTAL }, (_, i) => {
          const num = String(i + 1).padStart(2, "0");
          const n = byNum.get(num) ?? { number: num, sets: 0, amount: 0, boards: 0 };
          return (
            <NumberCell
              key={num}
              n={n}
              ballVariant="special"
              col={i % SPECIAL_COLS}
              row={Math.floor(i / SPECIAL_COLS)}
              totalCols={SPECIAL_COLS}
              totalRows={totalRows}
              heatLevel={getHeatLevel(n.amount, maxAmount)}
              selected={selected.has(num)}
              onToggle={onToggle}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── PlayType tự suy theo số main+special đã chọn ────────────────────────────

/**
 * Số main/special đã chọn → PlayType gợi ý cho UI (mirror Power 6/55 analysis §3.10(7)):
 * 4+1=mainCover4, 5+1=standard, 6-15+1=mainCoverN, 5+2..12=specialCover.
 *
 * Đây CHỈ là hint hiển thị (label + validate sớm client-side) — chốt chặn cuối là
 * `validateSelection` (domain rule) gọi trong dialog; server (`comboLookupQuerySchema.refine`)
 * validate lại độc lập, KHÔNG tin tưởng riêng hint này.
 */
function suggestPlayType(mainCount: number, specialCount: number): PlayType | null {
  if (specialCount === 1 && mainCount === 4) return PlayType.MainCover4;
  if (specialCount === 1 && mainCount === 5) return PlayType.Standard;
  if (specialCount === 1 && mainCount >= 6 && mainCount <= 15) return PlayType.MainCover;
  if (mainCount === 5 && specialCount >= 2 && specialCount <= 12) return PlayType.SpecialCover;
  return null;
}

// ─── Combo Lookup Dialog ──────────────────────────────────────────────────────

/**
 * Dialog tra cứu combo — mở từ action menu ⋯ trên header heatmap.
 *
 * 2 bảng cho chọn số main + special tuỳ ý; dialog lấy 2 bộ số đang chọn làm input,
 * PlayType tự suy theo số lượng (`suggestPlayType`) rồi validate lại bằng
 * `validateSelection` (domain rule — chốt chặn client trước khi gọi API).
 */
function ComboLookupDialog({
  open,
  onOpenChange,
  selectedMain,
  selectedSpecial,
  onToggleMain,
  onToggleSpecial,
  onClearAll,
  lookup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Số chính đang chọn (thứ tự chọn) — nguồn sự thật chung với main grid. */
  selectedMain: string[];
  /** Số ĐB đang chọn (thứ tự chọn) — nguồn sự thật chung với special grid. */
  selectedSpecial: string[];
  onToggleMain: (num: string) => void;
  onToggleSpecial: (num: string) => void;
  onClearAll: () => void;
  /** Mutation tra cứu (khởi tạo ở cha, dùng chung). */
  lookup: ReturnType<typeof useComboLookup>;
}) {
  const suggestedPt = suggestPlayType(selectedMain.length, selectedSpecial.length);
  const validation = suggestedPt
    ? validateSelection(suggestedPt, {
        mainNumbers: selectedMain,
        specialNumbers: selectedSpecial,
      })
    : { valid: false, errors: ["Chọn đủ số chính + số đặc biệt hợp lệ."] };
  const isValid = suggestedPt !== null && validation.valid;

  const handleLookup = () => {
    if (isValid && suggestedPt) {
      lookup.mutate({
        playType: suggestedPt,
        mainNumbers: selectedMain,
        specialNumbers: selectedSpecial,
      });
    }
  };

  const result = lookup.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Search className="size-4 text-muted-foreground" />
            Tra cứu bộ số dồn cược
          </DialogTitle>
          <DialogDescription className="text-xs">
            Chọn số chính + số đặc biệt trên 2 bảng để xem có bao nhiêu người/bộ đang dồn cược bộ này trong kỳ. Kiểu
            chơi tự suy theo số lượng đã chọn.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "text-xs font-medium tabular-nums",
                isValid ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
              )}
            >
              {selectedMain.length} số chính + {selectedSpecial.length} số ĐB
              {isValid ? " · hợp lệ" : ` · ${validation.errors[0] ?? "chưa hợp lệ"}`}
            </span>
            {(selectedMain.length > 0 || selectedSpecial.length > 0) && (
              <button
                type="button"
                onClick={onClearAll}
                className="text-xs text-muted-foreground/60 hover:text-muted-foreground underline underline-offset-2"
              >
                Xoá hết
              </button>
            )}
          </div>

          {selectedMain.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {[...selectedMain].sort().map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onToggleMain(n)}
                  className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 pl-2 pr-1 h-6 text-xs font-bold tabular-nums hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors"
                  title="Bỏ chọn"
                >
                  {n}
                  <X className="size-3" />
                </button>
              ))}
            </div>
          )}
          {selectedSpecial.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {[...selectedSpecial].sort().map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onToggleSpecial(n)}
                  className="inline-flex items-center gap-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 pl-2 pr-1 h-6 text-xs font-bold tabular-nums hover:bg-orange-200 dark:hover:bg-orange-900/60 transition-colors"
                  title="Bỏ chọn"
                >
                  {n}
                  <X className="size-3" />
                </button>
              ))}
            </div>
          )}

          {lookup.isError && <p className="text-xs text-destructive">Không tra cứu được — kiểm tra lại bộ số.</p>}

          {result &&
            (result.found ? (
              <div className="rounded-lg border border-border/60 bg-muted/10 overflow-hidden">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 border-b bg-muted/20 text-xs">
                  <span className="text-muted-foreground">
                    Người chơi:{" "}
                    <span className="font-semibold tabular-nums text-foreground">{formatNumber(result.players)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Số bộ:{" "}
                    <span className="font-semibold tabular-nums text-foreground">{formatNumber(result.sets)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Tổng tiền:{" "}
                    <span className="font-semibold tabular-nums text-foreground">{formatNumber(result.amount)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Giá 1 bộ:{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatNumber(result.boardPrice)}
                    </span>
                  </span>
                </div>
                <div className="divide-y divide-border/50 max-h-64 overflow-y-auto">
                  {result.accounts.map((a) => (
                    <div key={a.accountId} className="grid grid-cols-[1fr_4rem_6rem] items-center gap-2 px-3 py-1.5">
                      <div className="min-w-0" title={a.accountId}>
                        <p className="text-xs font-medium truncate">{a.username || a.accountId}</p>
                        {a.username && (
                          <p className="text-xs text-muted-foreground/60 truncate tabular-nums">{a.accountId}</p>
                        )}
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground text-right">
                        {formatNumber(a.sets)} bộ
                      </span>
                      <span className="text-xs tabular-nums font-semibold text-foreground text-right">
                        {formatNumber(a.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">Chưa có ai cược bộ này.</p>
            ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button onClick={handleLookup} disabled={!isValid || lookup.isPending}>
            {lookup.isPending ? "Đang tra…" : "Tra cứu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Public Export ────────────────────────────────────────────────────────────

/**
 * NumberHeatmap — Lotto 5/35. Main grid 7×5 = 35 số chính (amber) + Special grid
 * 4×3 = 12 số ĐB (orange), 5-level heat intensity theo dòng tiền.
 *
 * Mỗi ô hiển thị dòng tiền + số bộ cược chứa số. KHÔNG per-number liability (worst-case
 * là thuộc tính của LINE — xem TopPotential). Cả 2 bảng LUÔN cho click chọn số; action
 * menu ⋯ chứa "Tra cứu bộ số" (enable khi đã chọn ≥ 1 số) → dialog validate qua
 * `validateSelection`.
 */
export function NumberHeatmap({
  mainNumbers,
  specialNumbers,
  drawId,
}: {
  mainNumbers: NumberFreqItem[];
  specialNumbers: NumberFreqItem[];
  drawId?: string;
}) {
  const totalSets = mainNumbers.reduce((a, n) => a + n.sets, 0);

  // State chọn số (lift lên đây để 2 grid + dialog cùng đọc/ghi). KHÔNG giới hạn số lượng.
  const [selectedMain, setSelectedMain] = useState<string[]>([]);
  const [selectedSpecial, setSelectedSpecial] = useState<string[]>([]);
  const [lookupOpen, setLookupOpen] = useState(false);
  const selectedMainSet = useMemo(() => new Set(selectedMain), [selectedMain]);
  const selectedSpecialSet = useMemo(() => new Set(selectedSpecial), [selectedSpecial]);
  const lookup = useComboLookup(drawId);

  const toggleMain = useCallback((num: string) => {
    setSelectedMain((curr) => (curr.includes(num) ? curr.filter((n) => n !== num) : [...curr, num]));
  }, []);
  const toggleSpecial = useCallback((num: string) => {
    setSelectedSpecial((curr) => (curr.includes(num) ? curr.filter((n) => n !== num) : [...curr, num]));
  }, []);
  const clearAll = useCallback(() => {
    setSelectedMain([]);
    setSelectedSpecial([]);
  }, []);

  // Đổi kỳ (drawId) → reset lựa chọn cũ, tránh tra cứu nhầm kỳ khác.
  useEffect(() => {
    clearAll();
  }, [drawId, clearAll]);

  const totalSelected = selectedMain.length + selectedSpecial.length;
  const canLookup = !!drawId && totalSelected > 0;

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <BarChart2 className="size-4 text-muted-foreground shrink-0" />
            <div>
              <CardTitle className="text-sm font-semibold">Phân tích số cược</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {formatNumber(totalSets)} bộ cược · Chọn số trên bảng để tra cứu
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {totalSelected > 0 && (
              <>
                <span className="text-xs tabular-nums text-muted-foreground">Đã chọn {totalSelected} số</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  onClick={clearAll}
                  aria-label="Bỏ chọn tất cả"
                  title="Bỏ chọn tất cả"
                >
                  <X className="size-4" />
                </Button>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  aria-label="Thao tác bảng số"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Thao tác bảng số</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!canLookup} onSelect={() => setLookupOpen(true)}>
                  <Search className="size-4" />
                  <span className="flex-1">Tra cứu bộ số</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0 space-y-4">
        <div className="flex gap-4 items-start">
          <div className="flex-[7_7_0%] min-w-0">
            <MainGrid numbers={mainNumbers} selected={selectedMainSet} onToggle={toggleMain} />
          </div>
          <div className="flex-[4_4_0%] min-w-0">
            <SpecialGrid numbers={specialNumbers} selected={selectedSpecialSet} onToggle={toggleSpecial} />
          </div>
        </div>
      </CardContent>

      <ComboLookupDialog
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        selectedMain={selectedMain}
        selectedSpecial={selectedSpecial}
        onToggleMain={toggleMain}
        onToggleSpecial={toggleSpecial}
        onClearAll={clearAll}
        lookup={lookup}
      />
    </Card>
  );
}
