"use client";

import { useMemo, useState } from "react";
import { Save, TrendingUp, TrendingDown, Info, ChevronDown, ChevronUp } from "lucide-react";
import { formatNumber } from "@megawin/shared/utils/number";

import {
  analyzeProfitabilityForPick,
  getBasicOddsTable,
  TOTAL_OUTCOMES,
} from "@megawin/game-keno/rules";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MoneyInput } from "@megawin/ui/components/money-input";
import { cn } from "@/lib/utils";

import type { BasicPrizes } from "@megawin/game-keno/entities";
import type { KenoGameConfig } from "./use-game-config";

const PICK_MATCH_COUNTS: Record<number, number[]> = {
  1: [1],
  2: [2],
  3: [3, 2],
  4: [4, 3, 2],
  5: [5, 4, 3, 2],
  6: [6, 5, 4, 3],
  7: [7, 6, 5, 4, 3],
  8: [8, 7, 6, 5, 4, 3, 0],
  9: [9, 8, 7, 6, 5, 4, 0],
  10: [10, 9, 8, 7, 6, 5, 0],
};

const fmt = formatNumber;

const PICK_BADGE_COLORS: Record<number, string> = {
  10: "bg-red-500",
  9: "bg-orange-500",
  8: "bg-amber-600",
  7: "bg-amber-500",
  6: "bg-yellow-500",
  5: "bg-lime-500",
  4: "bg-emerald-500",
  3: "bg-teal-500",
  2: "bg-cyan-500",
  1: "bg-slate-500",
};

function isCapped(pick: number, match: number): boolean {
  return (
    (pick === 10 && match === 10) || (pick === 9 && match === 9) || (pick === 8 && match === 8)
  );
}

interface PrizesSectionProps {
  config: KenoGameConfig;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
}

function HeaderTooltip({
  label,
  tip,
  className,
}: {
  label: string;
  tip: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-1 cursor-help ${className ?? ""}`}>
          {label}
          <Info className="size-3 text-muted-foreground/60" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 text-xs">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

function PickPrizeGroup({
  pick,
  prizes,
  unitPrice,
  onChange,
}: {
  pick: number;
  prizes: Record<number, number>;
  unitPrice: number;
  onChange: (pick: number, match: number, value: number) => void;
}) {
  const [open, setOpen] = useState(pick >= 1);
  const matchCounts = PICK_MATCH_COUNTS[pick] ?? [];

  const profitAnalysis = useMemo(
    () => analyzeProfitabilityForPick(pick, prizes, unitPrice),
    [pick, prizes, unitPrice],
  );

  const profitMap = useMemo(
    () => new Map(profitAnalysis.tiers.map((t) => [t.matchCount, t])),
    [profitAnalysis],
  );

  const marginColor =
    profitAnalysis.grossMarginPercent >= 50
      ? "text-emerald-600"
      : profitAnalysis.grossMarginPercent >= 0
        ? "text-amber-600"
        : "text-red-600";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
            open && "bg-muted/30",
          )}
        >
          <div className="flex items-center gap-2">
            <Badge className={cn("text-white text-xs", PICK_BADGE_COLORS[pick])}>Bậc {pick}</Badge>
            <span className="text-sm text-muted-foreground">
              Chọn {pick} số &middot; {matchCounts.length} mức thưởng
            </span>
            {matchCounts.some((m) => isCapped(pick, m)) && (
              <Badge
                variant="outline"
                className="text-[10px] border-red-300 text-red-600 dark:text-red-400"
              >
                Có giới hạn
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className={cn("text-xs tabular-nums font-semibold", marginColor)}>
              Biên: {profitAnalysis.grossMarginPercent.toFixed(1)}%
            </span>
            {open ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-0.5">
          <div className="grid grid-cols-[2fr_160px_100px_120px_100px_120px] items-center gap-2 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <span>Mức trúng</span>
            <span className="text-right">Giá trị thưởng</span>
            <HeaderTooltip
              label="Xác suất"
              tip="1 in N: cứ N vé bán ra thì kỳ vọng 1 vé trúng."
              className="justify-end"
            />
            <HeaderTooltip
              label="CP kỳ vọng"
              tip="Chi phí trả thưởng kỳ vọng = xác suất × giải thưởng."
              className="justify-end"
            />
            <HeaderTooltip
              label="Tỷ lệ trả"
              tip="Tỷ lệ trả thưởng so với mệnh giá. >100% = lỗ."
              className="justify-end"
            />
            <HeaderTooltip
              label="Hoà vốn"
              tip="Giá trị giải thưởng tối đa để không lỗ."
              className="justify-end"
            />
          </div>
          {matchCounts.map((match) => {
            const profit = profitMap.get(match);
            const capped = isCapped(pick, match);
            const isOverBreakEven = profit && profit.currentPrize > profit.breakEvenPrize;

            return (
              <div
                key={match}
                className={cn(
                  "grid grid-cols-[2fr_160px_100px_120px_100px_120px] items-center gap-2 rounded-md px-2 py-1.5",
                  capped && "bg-red-50 dark:bg-red-950/20",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-6 items-center justify-center rounded bg-muted text-xs font-bold tabular-nums">
                    {match}
                  </span>
                  <span className="text-xs">
                    Trùng {match}/{pick}
                    {match === 0 && " (không trúng)"}
                  </span>
                </div>
                <MoneyInput
                  className="h-8 w-40 text-right tabular-nums text-sm font-semibold"
                  value={prizes[match] ?? 0}
                  onValueChange={(v) => onChange(pick, match, v ?? 0)}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-right text-xs tabular-nums text-muted-foreground cursor-help">
                      {profit ? `1 : ${fmt(Math.round(profit.oneInN))}` : "–"}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {profit && `Xác suất: ${(profit.probability * 100).toFixed(6)}%`}
                  </TooltipContent>
                </Tooltip>
                <span className="text-right text-xs tabular-nums font-medium">
                  {profit ? `${fmt(Math.round(profit.expectedPayout))}` : "–"}
                </span>
                <span
                  className={cn(
                    "text-right text-xs tabular-nums font-semibold",
                    profit && profit.payoutRatio > 1
                      ? "text-red-600"
                      : profit && profit.payoutRatio > 0.5
                        ? "text-amber-600"
                        : "text-emerald-600",
                  )}
                >
                  {profit ? `${(profit.payoutRatio * 100).toFixed(2)}%` : "–"}
                </span>
                <span
                  className={cn(
                    "text-right text-xs tabular-nums",
                    isOverBreakEven ? "text-red-600 font-bold" : "text-muted-foreground",
                  )}
                >
                  {profit ? `${fmt(Math.round(profit.breakEvenPrize))}` : "–"}
                </span>
              </div>
            );
          })}
          <div className="flex items-center justify-between px-2 py-2 border-t mt-1">
            <span className="text-xs font-medium text-muted-foreground">Tổng bậc {pick}</span>
            <div className="flex items-center gap-4 text-xs">
              <span className="tabular-nums">
                CP kỳ vọng: {fmt(Math.round(profitAnalysis.totalExpectedPayout))} VND
              </span>
              <span className={cn("font-bold tabular-nums", marginColor)}>
                {profitAnalysis.grossMarginPercent >= 0 ? (
                  <TrendingUp className="mr-1 inline size-3" />
                ) : (
                  <TrendingDown className="mr-1 inline size-3" />
                )}
                {profitAnalysis.grossMarginPercent.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function PrizesSection({ config, onSave, isPending }: PrizesSectionProps) {
  const [localPrizes, setLocalPrizes] = useState<BasicPrizes>(() => ({
    ...config.basicPrizes,
  }));
  const [isDirty, setIsDirty] = useState(false);

  const unitPrice = config.play.unitPrice;

  function handleChange(pick: number, match: number, value: number) {
    setLocalPrizes((prev) => ({
      ...prev,
      [`pick${pick}`]: { ...prev[`pick${pick}`], [match]: value },
    }));
    setIsDirty(true);
  }

  function handleSubmit() {
    onSave({ basicPrizes: localPrizes });
    setIsDirty(false);
  }

  const allSummaries = useMemo(() => {
    const results: Array<{
      pick: number;
      grossMarginPercent: number;
      totalExpectedPayout: number;
    }> = [];
    for (let pick = 1; pick <= 10; pick++) {
      const prizes = localPrizes[`pick${pick}`] ?? {};
      const analysis = analyzeProfitabilityForPick(pick, prizes, unitPrice);
      results.push({
        pick,
        grossMarginPercent: analysis.grossMarginPercent,
        totalExpectedPayout: analysis.totalExpectedPayout,
      });
    }
    return results;
  }, [localPrizes, unitPrice]);

  const avgMargin =
    allSummaries.reduce((s, r) => s + r.grossMarginPercent, 0) / allSummaries.length;

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <CardContent className="p-0">
        <div className="px-5 py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Giải thưởng cơ bản – Chọn số
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cấu hình giá trị cho từng bậc (1-10 số) theo số trùng
                {" · "}Mệnh giá: <strong>{fmt(unitPrice)} VND</strong>
                {" · "}Không gian mẫu: <strong>≈ 3.54 × 10¹⁵</strong>
              </p>
            </div>
            <div className="text-right text-xs shrink-0">
              <span className="text-muted-foreground">Biên LN trung bình</span>
              <div
                className={cn(
                  "font-bold tabular-nums",
                  avgMargin >= 50
                    ? "text-emerald-600"
                    : avgMargin >= 0
                      ? "text-amber-600"
                      : "text-red-600",
                )}
              >
                {avgMargin >= 0 ? (
                  <TrendingUp className="mr-1 inline size-3.5" />
                ) : (
                  <TrendingDown className="mr-1 inline size-3.5" />
                )}
                {avgMargin.toFixed(2)}%
              </div>
            </div>
          </div>
        </div>

        <div className="border-t px-5 py-3">
          <div className="grid gap-2 lg:grid-cols-2">
            <div className="space-y-2">
              {[10, 9, 8, 7].map((pick) => (
                <PickPrizeGroup
                  key={pick}
                  pick={pick}
                  prizes={localPrizes[`pick${pick}`] ?? {}}
                  unitPrice={unitPrice}
                  onChange={handleChange}
                />
              ))}
            </div>
            <div className="space-y-2">
              {[6, 5, 4, 3, 2, 1].map((pick) => (
                <PickPrizeGroup
                  key={pick}
                  pick={pick}
                  prizes={localPrizes[`pick${pick}`] ?? {}}
                  unitPrice={unitPrice}
                  onChange={handleChange}
                />
              ))}
            </div>
          </div>
        </div>
      </CardContent>

      <CardFooter className="justify-end border-t px-5 py-2.5">
        <Button type="button" disabled={isPending || !isDirty} onClick={handleSubmit}>
          {isPending ? <Spinner className="mr-2" /> : <Save className="mr-2 size-4" />}
          Lưu giải thưởng cơ bản
        </Button>
      </CardFooter>
    </Card>
  );
}
