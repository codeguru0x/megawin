"use client";

import { useMemo, useState } from "react";
import { Save, TrendingUp, TrendingDown, Info, ChevronDown, ChevronUp } from "lucide-react";
import { formatNumber } from "@megawin/shared/utils/number";

import {
  analyzeBigSmallProfitability,
  analyzeEvenOddProfitability,
  getBigSmallOdds,
  getEvenOddOdds,
} from "../../../../../../../../../packages/game-keno-application/game-keno/src/rules";
import { MoneyInput } from "@megawin/ui/components/money-input";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import type {
  BigSmallPrizes,
  EvenOddPrizes,
} from "../../../../../../../../../packages/game-keno-application/game-keno/src/entities";

import type { KenoGameConfig } from "./use-game-config";

const fmt = formatNumber;

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

interface SideBetsSectionProps {
  config: KenoGameConfig;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
}

const BS_FIELDS = [
  { key: "big13Plus" as const, label: "Lớn (≥13 số 41-80)" },
  { key: "big1112" as const, label: "Lớn (11-12 số 41-80)" },
  { key: "draw" as const, label: "Hoà (10+10)" },
  { key: "small1112" as const, label: "Nhỏ (11-12 số 1-40)" },
  { key: "small13Plus" as const, label: "Nhỏ (≥13 số 1-40)" },
] as const;

const EO_FIELDS = [
  { key: "even15Plus" as const, label: "Chẵn (≥15 số chẵn)" },
  { key: "even1314" as const, label: "Chẵn (13-14 số chẵn)" },
  { key: "even1112" as const, label: "Chẵn (11-12 số chẵn)" },
  { key: "draw" as const, label: "Hoà (10+10)" },
  { key: "odd1112" as const, label: "Lẻ (11-12 số lẻ)" },
  { key: "odd1314" as const, label: "Lẻ (13-14 số lẻ)" },
  { key: "odd15Plus" as const, label: "Lẻ (≥15 số lẻ)" },
] as const;

function BigSmallGroup({
  prizes,
  unitPrice,
  onChange,
}: {
  prizes: BigSmallPrizes;
  unitPrice: number;
  onChange: (key: keyof BigSmallPrizes, value: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const bsOdds = useMemo(() => getBigSmallOdds(), []);
  const analysis = useMemo(
    () => analyzeBigSmallProfitability(prizes, unitPrice),
    [prizes, unitPrice],
  );

  const worstMargin = Math.min(...analysis.tiers.map((t) => (1 - t.payoutRatio) * 100));
  const allSafe = analysis.tiers.every((t) => t.payoutRatio <= 1);

  const marginColor =
    worstMargin >= 50 ? "text-emerald-600" : worstMargin >= 0 ? "text-amber-600" : "text-red-600";

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
            <Badge className="bg-amber-500 text-white text-xs">Lớn/Nhỏ</Badge>
            <span className="text-sm text-muted-foreground">{BS_FIELDS.length} mức thưởng</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="size-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-xs">
                Dựa vào 20 số quay: đếm số lượng số "lớn" (41-80) và "nhỏ" (1-40).
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn("text-xs tabular-nums font-semibold", marginColor)}>
              {allSafe ? (
                <TrendingUp className="mr-0.5 inline size-3" />
              ) : (
                <TrendingDown className="mr-0.5 inline size-3" />
              )}
              Biên thấp nhất: {worstMargin.toFixed(1)}%
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
            <span>Kết quả</span>
            <span className="text-right">Giá trị thưởng</span>
            <HeaderTooltip
              label="Xác suất"
              tip="Xác suất xảy ra kết quả này trong 1 kỳ quay."
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
          {BS_FIELDS.map((f, i) => {
            const odds = bsOdds[f.key];
            const tier = analysis.tiers[i];
            const isOverBreakEven = tier && tier.currentPrize > tier.breakEvenPrize;
            return (
              <div
                key={f.key}
                className="grid grid-cols-[2fr_160px_100px_120px_100px_120px] items-center gap-2 rounded-md px-2 py-1.5"
              >
                <span className="text-xs">{f.label}</span>
                <MoneyInput
                  className="h-8 w-40 text-right tabular-nums text-sm font-semibold"
                  value={prizes[f.key]}
                  onValueChange={(v) => onChange(f.key, v ?? 0)}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-right text-xs tabular-nums text-muted-foreground cursor-help">
                      {(odds.probability * 100).toFixed(1)}%
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {`1 : ${fmt(Math.round(1 / odds.probability))}`}
                  </TooltipContent>
                </Tooltip>
                <span className="text-right text-xs tabular-nums font-medium">
                  {fmt(Math.round(odds.probability * prizes[f.key]))}
                </span>
                <span
                  className={cn(
                    "text-right text-xs tabular-nums font-semibold",
                    tier && tier.payoutRatio > 1
                      ? "text-red-600"
                      : tier && tier.payoutRatio > 0.5
                        ? "text-amber-600"
                        : "text-emerald-600",
                  )}
                >
                  {tier ? `${(tier.payoutRatio * 100).toFixed(2)}%` : "–"}
                </span>
                <span
                  className={cn(
                    "text-right text-xs tabular-nums",
                    isOverBreakEven ? "text-red-600 font-bold" : "text-muted-foreground",
                  )}
                >
                  {tier ? fmt(Math.round(tier.breakEvenPrize)) : "–"}
                </span>
              </div>
            );
          })}
          <div className="flex items-center justify-between px-2 py-2 border-t mt-1">
            <span className="text-xs font-medium text-muted-foreground">
              Tổng Lớn/Nhỏ ·{" "}
              {analysis.tiers.filter((t) => t.payoutRatio > 1).length > 0
                ? `${analysis.tiers.filter((t) => t.payoutRatio > 1).length} mức vượt hoà vốn`
                : "Tất cả an toàn"}
            </span>
            <span className={cn("text-xs font-bold tabular-nums", marginColor)}>
              {allSafe ? (
                <TrendingUp className="mr-1 inline size-3" />
              ) : (
                <TrendingDown className="mr-1 inline size-3" />
              )}
              Biên: {worstMargin.toFixed(1)}%{" ~ "}
              {Math.max(...analysis.tiers.map((t) => (1 - t.payoutRatio) * 100)).toFixed(1)}%
            </span>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function EvenOddGroup({
  prizes,
  unitPrice,
  onChange,
}: {
  prizes: EvenOddPrizes;
  unitPrice: number;
  onChange: (key: keyof EvenOddPrizes, value: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const eoOdds = useMemo(() => getEvenOddOdds(), []);
  const analysis = useMemo(
    () => analyzeEvenOddProfitability(prizes, unitPrice),
    [prizes, unitPrice],
  );

  const worstMargin = Math.min(...analysis.tiers.map((t) => (1 - t.payoutRatio) * 100));
  const allSafe = analysis.tiers.every((t) => t.payoutRatio <= 1);

  const marginColor =
    worstMargin >= 50 ? "text-emerald-600" : worstMargin >= 0 ? "text-amber-600" : "text-red-600";

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
            <Badge className="bg-teal-500 text-white text-xs">Chẵn/Lẻ</Badge>
            <span className="text-sm text-muted-foreground">{EO_FIELDS.length} mức thưởng</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="size-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-xs">
                Dựa vào 20 số quay: đếm số chẵn và số lẻ trong 20 số.
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn("text-xs tabular-nums font-semibold", marginColor)}>
              {allSafe ? (
                <TrendingUp className="mr-0.5 inline size-3" />
              ) : (
                <TrendingDown className="mr-0.5 inline size-3" />
              )}
              Biên thấp nhất: {worstMargin.toFixed(1)}%
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
            <span>Kết quả</span>
            <span className="text-right">Giá trị thưởng</span>
            <HeaderTooltip
              label="Xác suất"
              tip="Xác suất xảy ra kết quả này trong 1 kỳ quay."
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
          {EO_FIELDS.map((f, i) => {
            const odds = eoOdds[f.key];
            const tier = analysis.tiers[i];
            const isOverBreakEven = tier && tier.currentPrize > tier.breakEvenPrize;
            return (
              <div
                key={f.key}
                className="grid grid-cols-[2fr_160px_100px_120px_100px_120px] items-center gap-2 rounded-md px-2 py-1.5"
              >
                <span className="text-xs">{f.label}</span>
                <MoneyInput
                  className="h-8 w-40 text-right tabular-nums text-sm font-semibold"
                  value={prizes[f.key]}
                  onValueChange={(v) => onChange(f.key, v ?? 0)}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-right text-xs tabular-nums text-muted-foreground cursor-help">
                      {(odds.probability * 100).toFixed(1)}%
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {`1 : ${fmt(Math.round(1 / odds.probability))}`}
                  </TooltipContent>
                </Tooltip>
                <span className="text-right text-xs tabular-nums font-medium">
                  {fmt(Math.round(odds.probability * prizes[f.key]))}
                </span>
                <span
                  className={cn(
                    "text-right text-xs tabular-nums font-semibold",
                    tier && tier.payoutRatio > 1
                      ? "text-red-600"
                      : tier && tier.payoutRatio > 0.5
                        ? "text-amber-600"
                        : "text-emerald-600",
                  )}
                >
                  {tier ? `${(tier.payoutRatio * 100).toFixed(2)}%` : "–"}
                </span>
                <span
                  className={cn(
                    "text-right text-xs tabular-nums",
                    isOverBreakEven ? "text-red-600 font-bold" : "text-muted-foreground",
                  )}
                >
                  {tier ? fmt(Math.round(tier.breakEvenPrize)) : "–"}
                </span>
              </div>
            );
          })}
          <div className="flex items-center justify-between px-2 py-2 border-t mt-1">
            <span className="text-xs font-medium text-muted-foreground">
              Tổng Chẵn/Lẻ ·{" "}
              {analysis.tiers.filter((t) => t.payoutRatio > 1).length > 0
                ? `${analysis.tiers.filter((t) => t.payoutRatio > 1).length} mức vượt hoà vốn`
                : "Tất cả an toàn"}
            </span>
            <span className={cn("text-xs font-bold tabular-nums", marginColor)}>
              {allSafe ? (
                <TrendingUp className="mr-1 inline size-3" />
              ) : (
                <TrendingDown className="mr-1 inline size-3" />
              )}
              Biên: {worstMargin.toFixed(1)}%{" ~ "}
              {Math.max(...analysis.tiers.map((t) => (1 - t.payoutRatio) * 100)).toFixed(1)}%
            </span>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SideBetsSection({ config, onSave, isPending }: SideBetsSectionProps) {
  const [bsPrizes, setBsPrizes] = useState<BigSmallPrizes>({
    ...config.bigSmallPrizes,
  });
  const [eoPrizes, setEoPrizes] = useState<EvenOddPrizes>({
    ...config.evenOddPrizes,
  });
  const [isDirty, setIsDirty] = useState(false);

  const unitPrice = config.play.unitPrice;

  function handleSubmit() {
    onSave({
      bigSmallPrizes: bsPrizes,
      evenOddPrizes: eoPrizes,
    });
    setIsDirty(false);
  }

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <CardContent className="p-0">
        <div className="px-5 py-3">
          <h3 className="text-sm font-semibold text-foreground">
            Giải thưởng bổ sung – Lớn/Nhỏ & Chẵn/Lẻ
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Giải thưởng cho cách chơi bổ sung (Panel C)
            {" · "}Mệnh giá: <strong>{fmt(unitPrice)} VND</strong>
          </p>
        </div>

        <div className="border-t px-5 py-3">
          <div className="grid gap-2 lg:grid-cols-2">
            <div className="space-y-2">
              <BigSmallGroup
                prizes={bsPrizes}
                unitPrice={unitPrice}
                onChange={(key, value) => {
                  setBsPrizes((p) => ({ ...p, [key]: value }));
                  setIsDirty(true);
                }}
              />
            </div>
            <div className="space-y-2">
              <EvenOddGroup
                prizes={eoPrizes}
                unitPrice={unitPrice}
                onChange={(key, value) => {
                  setEoPrizes((p) => ({ ...p, [key]: value }));
                  setIsDirty(true);
                }}
              />
            </div>
          </div>
        </div>
      </CardContent>

      <CardFooter className="justify-end border-t px-5 py-2.5">
        <Button type="button" disabled={isPending || !isDirty} onClick={handleSubmit}>
          {isPending ? <Spinner className="mr-2" /> : <Save className="mr-2 size-4" />}
          Lưu giải thưởng bổ sung
        </Button>
      </CardFooter>
    </Card>
  );
}
