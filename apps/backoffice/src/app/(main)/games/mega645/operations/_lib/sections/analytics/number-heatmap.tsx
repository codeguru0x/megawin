"use client";

/**
 * Mega 6/45 — Number Heatmap (+ combo lookup)
 *
 * Grid 9 × 5 = 45 số chính (01-45). 5-level heat intensity (cold → hot, amber cho hot),
 * theo DÒNG TIỀN mỗi số. Bảng LUÔN cho click chọn số (không giới hạn), phục vụ tra cứu
 * combo. PlayType TỰ SUY theo số lượng đã chọn (5=bao5, 6=standard, 7-15=baoN, 18=bao18);
 * dialog validate đúng số lượng trước khi tra (analysis §3.10(7)).
 *
 * Export dùng chung: `NumberBadge` (filled/soft/outlined + selected), `NumbersWithTooltip`
 * (collapse > 7 số) — analytics-panels + live-feed import.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { PlayType, VALID_NUMBER_SET } from "@megawin/game-mega645/entities";
import { MEGA645_PLAY_TYPE_LABELS } from "@megawin/game-mega645/labels";
import { formatCurrency, formatNumber } from "@megawin/shared/utils";
import { BarChart2, MoreHorizontal, Search, X } from "lucide-react";

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

// ─── Mega 6/45 color tokens ──────────────────────────────────────────────────
// Brand: teal-600 (#0d9488) — source of truth: GAME_COLORS[GameProduct.Mega645].hex

const MEGA_HEX = "#0d9488"; // teal-600
const MEGA_MUTED_BG = "bg-muted/40 text-muted-foreground";

// ─── Heatmap Intensity Scale ─────────────────────────────────────────────────

type HeatLevel = "cold" | "low" | "mid" | "warm" | "hot";

const HEAT_BADGE_STYLES: Record<HeatLevel, string> = {
  cold: "bg-teal-200/80 text-teal-900 dark:bg-teal-900/40 dark:text-teal-200",
  low: "bg-teal-300 text-teal-900 dark:bg-teal-800 dark:text-teal-100",
  mid: "bg-teal-400 text-white dark:bg-teal-700",
  warm: "bg-teal-600 text-white",
  hot: "bg-amber-500 text-white ring-2 ring-amber-300/50",
};

const HEAT_CELL_BG: Record<HeatLevel, string> = {
  cold: "",
  low: "",
  mid: "bg-teal-50/40 dark:bg-teal-950/10",
  warm: "bg-teal-50/70 dark:bg-teal-950/20",
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
 * Badge tròn hiển thị số Mega 6/45.
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
  selected = false,
}: {
  num: string;
  variant?: NumberBadgeVariant;
  muted?: boolean;
  /** Chỉ dùng cho variant="filled" trong heatmap grid. */
  heatLevel?: HeatLevel;
  /** Đang được chọn trong chế độ tra cứu — badge tô đậm brand teal. */
  selected?: boolean;
}) {
  let colorClass: string;
  if (selected) {
    colorClass = "bg-teal-600 text-white ring-2 ring-teal-300/60";
  } else if (muted) {
    colorClass = MEGA_MUTED_BG;
  } else if (variant === "outlined") {
    colorClass =
      "border border-teal-400/70 text-teal-600 bg-transparent dark:border-teal-600 dark:text-teal-400";
  } else if (variant === "soft") {
    colorClass = "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300";
  } else {
    // filled — heat intensity
    colorClass = heatLevel ? HEAT_BADGE_STYLES[heatLevel] : "bg-teal-600 text-white";
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

/**
 * Render danh sách số; > 7 số → chỉ hiện 7 số đầu + chip "+N" có tooltip liệt kê đủ.
 * Dùng bởi LiveFeed (board Bao có thể tới 18 số) — tránh 1 dòng tràn ngang.
 */
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

function NumberCell({
  n,
  col,
  row,
  totalCols,
  totalRows,
  heatLevel,
  selected,
  onToggle,
}: {
  n: NumberFreqItem;
  col: number;
  row: number;
  totalCols: number;
  totalRows: number;
  heatLevel: HeatLevel;
  /** Đang được chọn — ô hiện ring teal nổi bật. */
  selected: boolean;
  onToggle: (num: string) => void;
}) {
  const isEmpty = n.sets === 0;
  const isLastCol = col === totalCols - 1;
  const isLastRow = row === totalRows - 1;
  const cellBg = isEmpty ? "" : HEAT_CELL_BG[heatLevel];

  const cellClass = cn(
    "relative select-none transition-colors text-left w-full",
    "border-r border-b border-border/50",
    isLastCol && "border-r-0",
    isLastRow && "border-b-0",
    HEATMAP_CELL_PT,
    "pb-1.5 px-1",
    cellBg || "bg-card",
    "cursor-pointer hover:bg-teal-100/50 dark:hover:bg-teal-950/30",
    selected && "bg-teal-100/80 ring-2 ring-inset ring-teal-500 dark:bg-teal-900/40",
  );

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Bảng số LUÔN cho chọn → <button> (a11y: aria-pressed + keyboard native). */}
          <button
            type="button"
            className={cellClass}
            onClick={() => onToggle(n.number)}
            aria-pressed={selected}
          >
            <span className="absolute top-1 left-1">
              <NumberBadge
                num={n.number}
                muted={isEmpty && !selected}
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
            <NumberBadge num={n.number} muted={isEmpty} />
            <span className="text-xs font-semibold">Số {n.number}</span>
          </div>
          {isEmpty ? (
            <p className="text-xs text-muted-foreground">Chưa có cược</p>
          ) : (
            <div className="space-y-1 min-w-37">
              <div className="flex justify-between gap-8">
                <span className="text-xs text-muted-foreground">Số bộ cược chứa số</span>
                <span className="text-xs font-semibold tabular-nums text-foreground">
                  {formatNumber(n.sets)}
                </span>
              </div>
              <div className="flex justify-between gap-8">
                <span className="text-xs text-muted-foreground">Tổng cược</span>
                <span className="text-xs font-semibold tabular-nums text-foreground">
                  {formatNumber(n.amount)}
                </span>
              </div>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Main Grid — 45 số (9 × 5) ───────────────────────────────────────────────

/** Số cột grid — layout UI (Mega 6/45 45 số → 9 cột × 5 hàng). */
const COLS = 9;
const TOTAL = 45;

/**
 * Ngưỡng dữ liệu thưa: tổng số bộ cược < 10 → heatmap chưa có ý nghĩa thống kê,
 * hiện hint để người trực ca không hiểu nhầm màu nhạt = "số lạnh".
 */
const SPARSE_DATA_THRESHOLD = 10;

function MainGrid({
  numbers,
  selected,
  onToggle,
}: {
  numbers: NumberFreqItem[];
  /** Bộ số đang chọn — ô đã chọn có ring teal. Bảng LUÔN cho click chọn. */
  selected: Set<string>;
  onToggle: (num: string) => void;
}) {
  const byNum = new Map(numbers.map((n) => [n.number, n]));
  const totalSets = numbers.reduce((a, n) => a + n.sets, 0);
  const totalAmount = numbers.reduce((a, n) => a + n.amount, 0);
  // Heat intensity theo DÒNG TIỀN — số nóng = số bị dồn tiền nhiều nhất.
  const maxAmount = numbers.reduce((a, n) => Math.max(a, n.amount), 0);
  const totalRows = Math.ceil(TOTAL / COLS);
  const isSparse = totalSets > 0 && totalSets < SPARSE_DATA_THRESHOLD;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex items-center justify-center size-4 rounded-full shrink-0 text-white text-[9px] font-bold"
            style={{ background: MEGA_HEX }}
          >
            M
          </span>
          <span className="text-xs font-semibold text-foreground">Số chính (01–45)</span>
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
        style={{ display: "grid", gridTemplateColumns: `repeat(${COLS}, 1fr)` }}
      >
        {Array.from({ length: TOTAL }, (_, i) => {
          const num = String(i + 1).padStart(2, "0");
          const n = byNum.get(num) ?? { number: num, sets: 0, amount: 0, boards: 0 };
          return (
            <NumberCell
              key={num}
              n={n}
              col={i % COLS}
              row={Math.floor(i / COLS)}
              totalCols={COLS}
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

// ─── PlayType tự suy theo số lượng đã chọn ───────────────────────────────────

/**
 * Số lượng số đã chọn → PlayType tương ứng (analysis §3.10(7)):
 * 5 → bao5, 6 → standard, 7-15 → baoN, 18 → bao18. null nếu không hợp lệ (vd 16/17).
 *
 * Mega 6/45 có cùng tập mức bao với Power 6/55 (5/6/7-15/18); đây là hint client,
 * server (`comboLookupQuerySchema` `.refine`) là chốt chặn cuối.
 */
const COUNT_TO_PLAY_TYPE: Record<number, PlayType> = {
  5: PlayType.Bao5,
  6: PlayType.Standard,
  7: PlayType.Bao7,
  8: PlayType.Bao8,
  9: PlayType.Bao9,
  10: PlayType.Bao10,
  11: PlayType.Bao11,
  12: PlayType.Bao12,
  13: PlayType.Bao13,
  14: PlayType.Bao14,
  15: PlayType.Bao15,
  18: PlayType.Bao18,
};

function playTypeForCount(count: number): PlayType | null {
  return COUNT_TO_PLAY_TYPE[count] ?? null;
}

/**
 * Dialog tra cứu combo — mở từ action menu ⋯ trên header heatmap.
 *
 * Bảng 45 số cho chọn số tuỳ ý; dialog lấy bộ số đang chọn làm input, PlayType tự suy
 * theo số lượng (chỉ 5/6/7-15/18 hợp lệ). Input CSV editable + chips số đồng bộ 2 chiều
 * với grid (state `selected` ở cha).
 */
function ComboLookupDialog({
  open,
  onOpenChange,
  selected,
  onToggleNumber,
  onReplace,
  onClear,
  lookup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bộ số đang chọn (thứ tự chọn) — nguồn sự thật chung với heatmap grid. */
  selected: string[];
  onToggleNumber: (num: string) => void;
  onReplace: (numbers: string[]) => void;
  onClear: () => void;
  /** Mutation tra cứu (khởi tạo ở cha, dùng chung). */
  lookup: ReturnType<typeof useComboLookup>;
}) {
  const [raw, setRaw] = useState("");

  const pt = playTypeForCount(selected.length);
  const isValidCount = pt !== null;

  // Nhập CSV thủ công → parse & replace selection. Chỉ commit khi mọi token là số 01-45
  // distinct — không chặn khi user đang gõ dở.
  const handleCsvChange = (value: string) => {
    setRaw(value);
    const parsed = value
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    const valid = parsed.every((n) => VALID_NUMBER_SET.has(n));
    if (valid && new Set(parsed).size === parsed.length) onReplace(parsed);
  };

  // Grid/chip đổi selection → phản ánh vào ô CSV.
  useEffect(() => {
    setRaw([...selected].sort().join(","));
  }, [selected]);

  const handleLookup = () => {
    if (pt) lookup.mutate({ playType: pt, numbers: selected });
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
            Chọn 5, 6, 7–15 hoặc 18 số trên bảng (hoặc gõ trực tiếp) để xem có bao nhiêu người/bộ
            đang dồn cược bộ này trong kỳ. Kiểu chơi tự suy theo số lượng số.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input
            type="text"
            value={raw}
            onChange={(e) => handleCsvChange(e.target.value)}
            placeholder="Nhập số, vd 01,05,12,... (hoặc chọn trên bảng)"
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm tabular-nums shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "text-xs font-medium tabular-nums",
                isValidCount ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
              )}
            >
              Đã chọn {selected.length} số
              {isValidCount && pt
                ? ` · ${MEGA645_PLAY_TYPE_LABELS[pt]}`
                : " · cần 5, 6, 7–15 hoặc 18"}
            </span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="text-xs text-muted-foreground/60 hover:text-muted-foreground underline underline-offset-2"
              >
                Xoá hết
              </button>
            )}
          </div>
          {selected.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {[...selected].sort().map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onToggleNumber(n)}
                  className="inline-flex items-center gap-0.5 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 pl-2 pr-1 h-6 text-xs font-bold tabular-nums hover:bg-teal-200 dark:hover:bg-teal-900/60 transition-colors"
                  title="Bỏ chọn"
                >
                  {n}
                  <X className="size-3" />
                </button>
              ))}
            </div>
          )}

          {lookup.isError && (
            <p className="text-xs text-destructive">Không tra cứu được — kiểm tra lại bộ số.</p>
          )}

          {result &&
            (result.found ? (
              <div className="rounded-lg border border-border/60 bg-muted/10 overflow-hidden">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 border-b bg-muted/20 text-xs">
                  <span className="text-muted-foreground">
                    Người chơi:{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatNumber(result.players)}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    Số bộ:{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatNumber(result.sets)}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    Tổng tiền:{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatNumber(result.amount)}
                    </span>
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
                    <div
                      key={a.accountId}
                      className="grid grid-cols-[1fr_4rem_6rem] items-center gap-2 px-3 py-1.5"
                    >
                      <div className="min-w-0" title={a.accountId}>
                        <p className="text-xs font-medium truncate">{a.username || a.accountId}</p>
                        {a.username && (
                          <p className="text-xs text-muted-foreground/60 truncate tabular-nums">
                            {a.accountId}
                          </p>
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
          <Button onClick={handleLookup} disabled={!isValidCount || lookup.isPending}>
            {lookup.isPending ? "Đang tra…" : "Tra cứu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Public Export ────────────────────────────────────────────────────────────

/**
 * NumberHeatmap — Mega 6/45. Grid 9×5 = 45 số chính. Theme teal với 5-level heat
 * intensity (theo dòng tiền, hot = amber cross-game).
 *
 * Mỗi ô hiển thị dòng tiền + số bộ cược chứa số. KHÔNG per-number liability (worst-case là
 * thuộc tính của LINE, gán từng số sẽ double-count — rủi ro đo ở cấp entry, xem TopPotential).
 *
 * Bảng LUÔN cho click chọn số (không giới hạn). Nút X "Bỏ chọn" NGOÀI menu cạnh counter;
 * action menu ⋯ chứa "Tra cứu bộ số" (enable khi đã chọn ≥ 1) → dialog validate số lượng.
 */
export function NumberHeatmap({ numbers, drawId }: { numbers: NumberFreqItem[]; drawId?: string }) {
  const totalSets = numbers.reduce((a, n) => a + n.sets, 0);

  // State chọn số (lift lên đây để grid + dialog cùng đọc/ghi). KHÔNG giới hạn số lượng.
  const [selected, setSelected] = useState<string[]>([]);
  const [lookupOpen, setLookupOpen] = useState(false);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const lookup = useComboLookup(drawId);

  const toggleNumber = useCallback((num: string) => {
    setSelected((curr) => (curr.includes(num) ? curr.filter((n) => n !== num) : [...curr, num]));
  }, []);
  const clearSelected = useCallback(() => setSelected([]), []);
  const replaceSelected = useCallback((nums: string[]) => setSelected(nums), []);

  const canLookup = !!drawId && selected.length > 0;

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
            {selected.length > 0 && (
              <>
                <span className="text-xs tabular-nums text-muted-foreground">
                  Đã chọn {selected.length} số
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-foreground"
                  onClick={clearSelected}
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
        <MainGrid numbers={numbers} selected={selectedSet} onToggle={toggleNumber} />
      </CardContent>

      <ComboLookupDialog
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        selected={selected}
        onToggleNumber={toggleNumber}
        onReplace={replaceSelected}
        onClear={clearSelected}
        lookup={lookup}
      />
    </Card>
  );
}
