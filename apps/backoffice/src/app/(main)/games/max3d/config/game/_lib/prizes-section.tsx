"use client";

import { useMemo } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  analyzeBasicStraightProfitability,
  analyzePlusProfitability,
  BASIC_TOTAL_OUTCOMES,
  getBasicOddsTable,
  getCombo3OddsTable,
  getCombo6OddsTable,
  getPlusOddsTable,
  PLUS_TOTAL_OUTCOMES,
} from "@megawin/game-max3d/rules";
import { MoneyInput } from "@megawin/ui/components/money-input";
import { Info, Save, TrendingDown, TrendingUp } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAiFormDirty } from "@/hooks/use-ai-form-dirty";

import type { GameConfig } from "./use-game-config";

const fmt = (n: number) => n.toLocaleString("en-US");

const prizesFormSchema = z.object({
  basicSpecial: z.number().int().positive("Phải > 0"),
  basicFirst: z.number().int().positive("Phải > 0"),
  basicSecond: z.number().int().positive("Phải > 0"),
  basicThird: z.number().int().positive("Phải > 0"),
  combo3Special: z.number().int().positive("Phải > 0"),
  combo3First: z.number().int().positive("Phải > 0"),
  combo3Second: z.number().int().positive("Phải > 0"),
  combo3Third: z.number().int().positive("Phải > 0"),
  combo6Special: z.number().int().positive("Phải > 0"),
  combo6First: z.number().int().positive("Phải > 0"),
  combo6Second: z.number().int().positive("Phải > 0"),
  combo6Third: z.number().int().positive("Phải > 0"),
  plusSpecial: z.number().int().positive("Phải > 0"),
  plusFirst: z.number().int().positive("Phải > 0"),
  plusSecond: z.number().int().positive("Phải > 0"),
  plusThird: z.number().int().positive("Phải > 0"),
  plusFourth: z.number().int().positive("Phải > 0"),
  plusFifth: z.number().int().positive("Phải > 0"),
  plusSixth: z.number().int().positive("Phải > 0"),
});

type PrizesFormValues = z.infer<typeof prizesFormSchema>;

interface PrizesSectionProps {
  config: GameConfig;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
}

const BASIC_FIELDS = [
  {
    key: "basicSpecial" as const,
    tier: "special" as const,
    label: "Giải Đặc Biệt",
    desc: "trùng 1 trong 2 bộ ĐB",
    badge: "ĐB",
    color: "bg-red-600 text-white",
  },
  {
    key: "basicFirst" as const,
    tier: "first" as const,
    label: "Giải Nhất",
    desc: "trùng 1 trong 4 bộ Nhất",
    badge: "1st",
    color: "bg-amber-500 text-white",
  },
  {
    key: "basicSecond" as const,
    tier: "second" as const,
    label: "Giải Nhì",
    desc: "trùng 1 trong 6 bộ Nhì",
    badge: "2nd",
    color: "bg-slate-400 text-white",
  },
  {
    key: "basicThird" as const,
    tier: "third" as const,
    label: "Giải Ba",
    desc: "trùng 1 trong 8 bộ Ba",
    badge: "3rd",
    color: "bg-amber-700 text-white",
  },
] as const;

const COMBO3_FIELDS = [
  {
    key: "combo3Special" as const,
    tier: "special" as const,
    label: "Giải Đặc Biệt",
    desc: "3 hoán vị, trùng bộ ĐB",
    badge: "ĐB",
    color: "bg-red-600 text-white",
  },
  {
    key: "combo3First" as const,
    tier: "first" as const,
    label: "Giải Nhất",
    desc: "3 hoán vị, trùng bộ Nhất",
    badge: "1st",
    color: "bg-amber-500 text-white",
  },
  {
    key: "combo3Second" as const,
    tier: "second" as const,
    label: "Giải Nhì",
    desc: "3 hoán vị, trùng bộ Nhì",
    badge: "2nd",
    color: "bg-slate-400 text-white",
  },
  {
    key: "combo3Third" as const,
    tier: "third" as const,
    label: "Giải Ba",
    desc: "3 hoán vị, trùng bộ Ba",
    badge: "3rd",
    color: "bg-amber-700 text-white",
  },
] as const;

const COMBO6_FIELDS = [
  {
    key: "combo6Special" as const,
    tier: "special" as const,
    label: "Giải Đặc Biệt",
    desc: "6 hoán vị, trùng bộ ĐB",
    badge: "ĐB",
    color: "bg-red-600 text-white",
  },
  {
    key: "combo6First" as const,
    tier: "first" as const,
    label: "Giải Nhất",
    desc: "6 hoán vị, trùng bộ Nhất",
    badge: "1st",
    color: "bg-amber-500 text-white",
  },
  {
    key: "combo6Second" as const,
    tier: "second" as const,
    label: "Giải Nhì",
    desc: "6 hoán vị, trùng bộ Nhì",
    badge: "2nd",
    color: "bg-slate-400 text-white",
  },
  {
    key: "combo6Third" as const,
    tier: "third" as const,
    label: "Giải Ba",
    desc: "6 hoán vị, trùng bộ Ba",
    badge: "3rd",
    color: "bg-amber-700 text-white",
  },
] as const;

const PLUS_FIELDS = [
  {
    key: "plusSpecial" as const,
    tier: "special" as const,
    label: "Giải Đặc Biệt",
    desc: "2 bộ khớp đủ 2 bộ ĐB",
    badge: "ĐB",
    color: "bg-red-600 text-white",
  },
  {
    key: "plusFirst" as const,
    tier: "first" as const,
    label: "Giải Nhất",
    desc: "2 bộ khớp 2 bộ Nhất riêng biệt",
    badge: "1st",
    color: "bg-amber-500 text-white",
  },
  {
    key: "plusSecond" as const,
    tier: "second" as const,
    label: "Giải Nhì",
    desc: "2 bộ khớp 2 bộ Nhì riêng biệt",
    badge: "2nd",
    color: "bg-slate-400 text-white",
  },
  {
    key: "plusThird" as const,
    tier: "third" as const,
    label: "Giải Ba",
    desc: "2 bộ khớp 2 bộ Ba riêng biệt",
    badge: "3rd",
    color: "bg-amber-700 text-white",
  },
  {
    key: "plusFourth" as const,
    tier: "fourth" as const,
    label: "Giải Tư",
    desc: "2 bộ khớp 2 kết quả bất kỳ trong 20 bộ",
    badge: "4th",
    color: "bg-slate-500 text-white",
  },
  {
    key: "plusFifth" as const,
    tier: "fifth" as const,
    label: "Giải Năm",
    desc: "mỗi bộ khớp 1 bộ ĐB (xét riêng từng bộ)",
    badge: "5th",
    color: "bg-slate-600 text-white",
  },
  {
    key: "plusSixth" as const,
    tier: "sixth" as const,
    label: "Giải Sáu",
    desc: "mỗi bộ khớp 1 bộ Nhất/Nhì/Ba (xét riêng)",
    badge: "6th",
    color: "bg-emerald-600 text-white",
  },
] as const;

function HeaderTooltip({ label, tip, className }: { label: string; tip: string; className?: string }) {
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

interface ProfitBarProps {
  analysis: { totalExpectedPayout: number; grossMarginPercent: number; grossMarginPerLine: number };
  unitPrice: number;
  totalOutcomes: number;
  modeLabel: string;
  /** Số lines per board. Combo3 = 3, Combo6 = 6, còn lại = 1. */
  lineCount?: number;
  /**
   * Ghi chú nghiệp vụ hiện dưới dòng thông tin giá — dùng cho ngoại lệ số hoán vị, gộp giải.
   * Truyền `string[]` khi có nhiều ý tách biệt (mỗi ý 1 bullet) để tránh dồn thành
   * 1 câu dài khó đọc; truyền `string` khi chỉ có 1 ý ngắn.
   */
  note?: string | string[];
}

function ProfitBar({ analysis, unitPrice, totalOutcomes, modeLabel, lineCount = 1, note }: ProfitBarProps) {
  const boardCost = unitPrice * lineCount;
  const isCombo = lineCount > 1;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{modeLabel}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tổng không gian mẫu: <strong>{fmt(totalOutcomes)}</strong>
            {" · "}
            {isCombo ? (
              <>
                Giá 1 board: <strong>{fmt(boardCost)} VND</strong>
                <span className="text-muted-foreground/70">
                  {" "}
                  ({lineCount} lines × {fmt(unitPrice)})
                </span>
              </>
            ) : (
              <>
                Giá 1 line: <strong>{fmt(unitPrice)} VND</strong>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs shrink-0">
          <div className="text-right">
            <span className="text-muted-foreground">CP kỳ vọng{isCombo ? " / board" : " / line"}</span>
            <div className="font-semibold tabular-nums">{fmt(Math.round(analysis.totalExpectedPayout))} VND</div>
          </div>
          <div className="text-right">
            <span className="text-muted-foreground">Biên lợi nhuận gộp</span>
            <div
              className={`font-bold tabular-nums ${analysis.grossMarginPercent >= 0 ? "text-emerald-600" : "text-red-600"}`}
            >
              {analysis.grossMarginPercent >= 0 ? (
                <TrendingUp className="mr-1 inline size-3.5" />
              ) : (
                <TrendingDown className="mr-1 inline size-3.5" />
              )}
              {analysis.grossMarginPercent.toFixed(2)}%
              <span className="ml-1 font-normal text-muted-foreground">
                ({fmt(Math.round(analysis.grossMarginPerLine))} VND{isCombo ? "/board" : "/line"})
              </span>
            </div>
          </div>
        </div>
      </div>
      {note ? (
        <div className="text-xs text-muted-foreground/80 mt-2 leading-snug">
          {Array.isArray(note) ? (
            <ul className="list-disc space-y-0.5 pl-4">
              {note.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p>{note}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

const TABLE_GRID = "grid grid-cols-[auto_1fr_176px_120px_140px_100px_140px] items-center gap-3";
const TABLE_HEADER_CLS = `${TABLE_GRID} bg-muted/40 px-6 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground min-w-240`;
const TABLE_ROW_CLS = `${TABLE_GRID} px-6 py-3 transition-colors hover:bg-muted/20 min-w-240`;

interface TableHeaderProps {
  /** Số line/board. Combo3 = 3, Combo6 = 6, còn lại = 1 — quyết định mẫu số của Tỷ lệ TT. */
  lineCount?: number;
}

function TableHeader({ lineCount = 1 }: TableHeaderProps) {
  const isCombo = lineCount > 1;
  const costLabel = isCombo ? "Giá 1 board" : "Giá 1 line";

  return (
    <div className={TABLE_HEADER_CLS}>
      <span className="w-9" />
      <span>Hạng giải</span>
      <span className="text-right">Giá trị thưởng</span>
      <HeaderTooltip
        label="Xác suất"
        tip={
          isCombo
            ? `Xác suất trúng hạng này của CẢ BOARD (${lineCount} hoán vị). Vì mỗi hoán vị được so khớp độc lập nên board trúng nhiều lần thì lĩnh nhiều lần — con số này là số lần trúng kỳ vọng, không phải xác suất "ít nhất 1 lần". '1 : N' nghĩa là cứ N board bán ra thì kỳ vọng 1 lần trúng hạng này.`
            : "Xác suất trúng hạng này cho 1 line. Các hạng KHÔNG loại trừ nhau — 20 bộ kết quả quay độc lập nên 1 bộ số có thể trúng nhiều hạng và lĩnh tổng. '1 : N' nghĩa là cứ N line bán ra thì kỳ vọng 1 line trúng hạng này."
        }
        className="justify-end"
      />
      <HeaderTooltip
        label="CP kỳ vọng"
        tip={`Chi phí trả thưởng kỳ vọng của RIÊNG hạng này = Xác suất × Giá trị giải${isCombo ? ", tính cho cả board" : ""}. Tổng CP kỳ vọng của board xem ở thanh trên cùng.`}
        className="justify-end"
      />
      <HeaderTooltip
        label="Tỷ lệ TT"
        tip={`Tỷ lệ trả thưởng của RIÊNG hạng này = CP kỳ vọng ÷ ${costLabel} × 100%. Tổng các hạng mới là tỷ lệ trả thưởng thật của board — 1 hạng dưới 100% không có nghĩa board an toàn.`}
        className="justify-end"
      />
      <HeaderTooltip
        label="Hoà vốn"
        tip={`Giá trị giải tối đa để RIÊNG hạng này không lỗ = ${costLabel} ÷ Xác suất. Do các hạng cộng dồn, phải đặt giải THẤP HƠN con số này để tổng board vẫn có lãi.`}
        className="justify-end"
      />
    </div>
  );
}

interface OddsRowProps {
  field: { key: string; label: string; desc: string; badge: string; color: string };
  odds: { probability: number; oneInN: number; ways?: number } | undefined;
  profit: { expectedPayout: number; payoutRatio: number; breakEvenPrize: number; currentPrize: number } | undefined;
  formField: any;
  isLast: boolean;
  totalOutcomes: number;
  /** Số line/board. Combo3 = 3, Combo6 = 6, còn lại = 1 — quyết định cách diễn giải tooltip xác suất. */
  lineCount?: number;
}

function OddsRow({ field: p, odds, profit, formField, isLast, totalOutcomes, lineCount = 1 }: OddsRowProps) {
  const isOverBreakEven = profit && profit.currentPrize > profit.breakEvenPrize;
  const isCombo = lineCount > 1;
  const unitLabel = isCombo ? "board" : "line";
  return (
    <FormField
      key={formField.key}
      control={formField.control}
      name={formField.name}
      render={({ field }) => (
        <FormItem>
          <div className={`${TABLE_ROW_CLS} ${isLast ? "" : "border-b"}`}>
            <Badge className={`${p.color} w-9 justify-center text-xs font-bold`}>{p.badge}</Badge>
            <div>
              <span className="text-sm font-medium">{p.label}</span>
              <span className="ml-2 text-xs text-muted-foreground">{p.desc}</span>
            </div>
            <FormControl>
              <MoneyInput
                className="w-44 text-right font-semibold"
                value={field.value}
                onValueChange={(v) => field.onChange(v ?? 0)}
                onBlur={field.onBlur}
                name={field.name}
                ref={field.ref}
              />
            </FormControl>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-right text-xs tabular-nums text-muted-foreground cursor-help">
                  {odds ? `1 : ${fmt(Math.round(odds.oneInN))}` : "–"}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-72 text-xs">
                {odds && (
                  <>
                    {isCombo ? "Số lần trúng kỳ vọng" : "Số cách trúng"}:{" "}
                    {fmt(Math.round(odds.probability * totalOutcomes))} / {fmt(totalOutcomes)} {unitLabel}
                    <br />
                    {isCombo ? "Số lần trúng / board" : "Xác suất"}: {(odds.probability * 100).toFixed(6)}%
                  </>
                )}
              </TooltipContent>
            </Tooltip>
            <span className="text-right text-xs tabular-nums font-medium">
              {profit ? `${fmt(Math.round(profit.expectedPayout))} VND` : "–"}
            </span>
            <span
              className={`text-right text-xs tabular-nums font-semibold ${
                profit && profit.payoutRatio > 1
                  ? "text-red-600"
                  : profit && profit.payoutRatio > 0.5
                    ? "text-amber-600"
                    : "text-emerald-600"
              }`}
            >
              {profit ? `${(profit.payoutRatio * 100).toFixed(2)}%` : "–"}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={`text-right text-xs tabular-nums cursor-help ${isOverBreakEven ? "text-red-600 font-bold" : "text-muted-foreground"}`}
                >
                  {profit ? `${fmt(Math.round(profit.breakEvenPrize))} VND` : "–"}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-80 text-xs">
                {isOverBreakEven
                  ? `Giải thưởng (${fmt(profit!.currentPrize)}) vượt mức hoà vốn của RIÊNG hạng này (${fmt(Math.round(profit!.breakEvenPrize))}) → chỉ hạng này đã lỗ`
                  : profit
                    ? `Tối đa ${fmt(Math.round(profit.breakEvenPrize))} VND để RIÊNG hạng này hoà vốn. Các hạng cộng dồn nên phải đặt thấp hơn mức này.`
                    : "–"}
              </TooltipContent>
            </Tooltip>
          </div>
          <FormMessage className="px-6" />
        </FormItem>
      )}
    />
  );
}

export function PrizesSection({ config, onSave, isPending }: PrizesSectionProps) {
  const form = useForm<PrizesFormValues>({
    resolver: zodResolver(prizesFormSchema),
    values: {
      basicSpecial: config.defaultPrizes.basic.special,
      basicFirst: config.defaultPrizes.basic.first,
      basicSecond: config.defaultPrizes.basic.second,
      basicThird: config.defaultPrizes.basic.third,
      combo3Special: config.defaultPrizes.combo.combo3.special,
      combo3First: config.defaultPrizes.combo.combo3.first,
      combo3Second: config.defaultPrizes.combo.combo3.second,
      combo3Third: config.defaultPrizes.combo.combo3.third,
      combo6Special: config.defaultPrizes.combo.combo6.special,
      combo6First: config.defaultPrizes.combo.combo6.first,
      combo6Second: config.defaultPrizes.combo.combo6.second,
      combo6Third: config.defaultPrizes.combo.combo6.third,
      plusSpecial: config.defaultPrizes.plus.special,
      plusFirst: config.defaultPrizes.plus.first,
      plusSecond: config.defaultPrizes.plus.second,
      plusThird: config.defaultPrizes.plus.third,
      plusFourth: config.defaultPrizes.plus.fourth,
      plusFifth: config.defaultPrizes.plus.fifth,
      plusSixth: config.defaultPrizes.plus.sixth,
    },
  });

  useAiFormDirty("prizes", form.formState.isDirty);

  const w = form.watch();
  const unitPrice = config.play.unitPrice;

  const basicOdds = useMemo(() => getBasicOddsTable(), []);
  const combo3Odds = useMemo(() => getCombo3OddsTable(), []);
  const combo6Odds = useMemo(() => getCombo6OddsTable(), []);
  const plusOdds = useMemo(() => getPlusOddsTable(), []);

  const basicAnalysis = useMemo(
    () =>
      analyzeBasicStraightProfitability(
        {
          special: w.basicSpecial,
          first: w.basicFirst,
          second: w.basicSecond,
          third: w.basicThird,
        },
        unitPrice,
      ),
    [w.basicSpecial, w.basicFirst, w.basicSecond, w.basicThird, unitPrice],
  );

  const combo3Analysis = useMemo(() => {
    const odds = combo3Odds;
    const lineCount = 3;
    const boardCost = unitPrice * lineCount;
    const prizes = {
      special: w.combo3Special,
      first: w.combo3First,
      second: w.combo3Second,
      third: w.combo3Third,
    };
    const tiers = odds.map((o) => {
      const prize = prizes[o.tier];
      const ep = o.probability * prize;
      return {
        tier: o.tier,
        label: o.label,
        probability: o.probability,
        oneInN: o.oneInN,
        currentPrize: prize,
        expectedPayout: ep,
        payoutRatio: boardCost > 0 ? ep / boardCost : 0,
        breakEvenPrize: o.probability > 0 ? boardCost / o.probability : Infinity,
      };
    });
    const totalEP = tiers.reduce((s, t) => s + t.expectedPayout, 0);
    const gm = boardCost - totalEP;
    return {
      lineCount,
      boardCost,
      tiers,
      totalExpectedPayout: totalEP,
      totalPayoutRatio: boardCost > 0 ? totalEP / boardCost : 0,
      grossMarginPerLine: gm,
      grossMarginPercent: boardCost > 0 ? (gm / boardCost) * 100 : 0,
    };
  }, [w.combo3Special, w.combo3First, w.combo3Second, w.combo3Third, unitPrice, combo3Odds]);

  const combo6Analysis = useMemo(() => {
    const odds = combo6Odds;
    const lineCount = 6;
    const boardCost = unitPrice * lineCount;
    const prizes = {
      special: w.combo6Special,
      first: w.combo6First,
      second: w.combo6Second,
      third: w.combo6Third,
    };
    const tiers = odds.map((o) => {
      const prize = prizes[o.tier];
      const ep = o.probability * prize;
      return {
        tier: o.tier,
        label: o.label,
        probability: o.probability,
        oneInN: o.oneInN,
        currentPrize: prize,
        expectedPayout: ep,
        payoutRatio: boardCost > 0 ? ep / boardCost : 0,
        breakEvenPrize: o.probability > 0 ? boardCost / o.probability : Infinity,
      };
    });
    const totalEP = tiers.reduce((s, t) => s + t.expectedPayout, 0);
    const gm = boardCost - totalEP;
    return {
      lineCount,
      boardCost,
      tiers,
      totalExpectedPayout: totalEP,
      totalPayoutRatio: boardCost > 0 ? totalEP / boardCost : 0,
      grossMarginPerLine: gm,
      grossMarginPercent: boardCost > 0 ? (gm / boardCost) * 100 : 0,
    };
  }, [w.combo6Special, w.combo6First, w.combo6Second, w.combo6Third, unitPrice, combo6Odds]);

  const plusAnalysis = useMemo(
    () =>
      analyzePlusProfitability(
        {
          special: w.plusSpecial,
          first: w.plusFirst,
          second: w.plusSecond,
          third: w.plusThird,
          fourth: w.plusFourth,
          fifth: w.plusFifth,
          sixth: w.plusSixth,
        },
        unitPrice,
      ),
    [w.plusSpecial, w.plusFirst, w.plusSecond, w.plusThird, w.plusFourth, w.plusFifth, w.plusSixth, unitPrice],
  );

  const basicProfitMap = useMemo(() => new Map(basicAnalysis.tiers.map((t) => [t.tier, t])), [basicAnalysis]);
  const basicOddsMap = useMemo(() => new Map(basicOdds.map((o) => [o.tier, o])), [basicOdds]);
  const combo3ProfitMap = useMemo(() => new Map(combo3Analysis.tiers.map((t) => [t.tier, t])), [combo3Analysis]);
  const combo3OddsMap = useMemo(() => new Map(combo3Odds.map((o) => [o.tier, o])), [combo3Odds]);
  const combo6ProfitMap = useMemo(() => new Map(combo6Analysis.tiers.map((t) => [t.tier, t])), [combo6Analysis]);
  const combo6OddsMap = useMemo(() => new Map(combo6Odds.map((o) => [o.tier, o])), [combo6Odds]);
  const plusProfitMap = useMemo(() => new Map(plusAnalysis.tiers.map((t) => [t.tier, t])), [plusAnalysis]);
  const plusOddsMap = useMemo(() => new Map(plusOdds.map((o) => [o.tier, o])), [plusOdds]);

  function handleSubmit(values: PrizesFormValues) {
    onSave({
      defaultPrizes: {
        basic: {
          special: values.basicSpecial,
          first: values.basicFirst,
          second: values.basicSecond,
          third: values.basicThird,
        },
        combo: {
          combo3: {
            special: values.combo3Special,
            first: values.combo3First,
            second: values.combo3Second,
            third: values.combo3Third,
          },
          combo6: {
            special: values.combo6Special,
            first: values.combo6First,
            second: values.combo6Second,
            third: values.combo6Third,
          },
        },
        plus: {
          special: values.plusSpecial,
          first: values.plusFirst,
          second: values.plusSecond,
          third: values.plusThird,
          fourth: values.plusFourth,
          fifth: values.plusFifth,
          sixth: values.plusSixth,
        },
      },
    });
  }

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="p-0">
            <Tabs defaultValue="basic" className="w-full">
              <div className="border-b px-6 pt-4">
                <TabsList variant="line" className="w-full justify-start gap-0 border-b-0 px-0">
                  <TabsTrigger value="basic" className="gap-1.5 text-xs">
                    Cơ Bản (Straight)
                  </TabsTrigger>
                  <TabsTrigger value="combo" className="gap-1.5 text-xs">
                    Tổ Hợp (Combo)
                  </TabsTrigger>
                  <TabsTrigger value="plus" className="gap-1.5 text-xs">
                    Max 3D+
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Basic Straight */}
              <TabsContent value="basic" className="mt-0">
                <div className="p-6 pb-4">
                  <ProfitBar
                    analysis={basicAnalysis}
                    unitPrice={unitPrice}
                    totalOutcomes={BASIC_TOTAL_OUTCOMES}
                    modeLabel="Max 3D Cơ Bản — Straight"
                    note="Người chơi chọn 1 bộ ba số, so khớp đúng thứ tự với cả 4 hạng. 20 bộ kết quả quay độc lập nên 1 bộ số có thể xuất hiện ở nhiều hạng — khi đó lĩnh TỔNG các hạng trúng, vì vậy tỷ lệ trả thưởng của board là tổng 4 hàng dưới."
                  />
                </div>
                <div className="border-t overflow-x-auto">
                  <TableHeader />
                  {BASIC_FIELDS.map((p, idx) => (
                    <OddsRow
                      key={p.key}
                      field={p}
                      odds={basicOddsMap.get(p.tier)}
                      profit={basicProfitMap.get(p.tier)}
                      formField={{ key: p.key, control: form.control, name: p.key }}
                      isLast={idx === BASIC_FIELDS.length - 1}
                      totalOutcomes={BASIC_TOTAL_OUTCOMES}
                    />
                  ))}
                </div>
              </TabsContent>

              {/* Combo */}
              <TabsContent value="combo" className="mt-0">
                <div className="p-6 pb-4">
                  <ProfitBar
                    analysis={combo3Analysis}
                    unitPrice={unitPrice}
                    totalOutcomes={BASIC_TOTAL_OUTCOMES}
                    modeLabel="Tổ Hợp 3 (Combo3) — 3 hoán vị"
                    lineCount={3}
                    note="Bảng giả định bộ số dạng aab (2 chữ số giống) → đúng 3 hoán vị, mỗi hoán vị là 1 line dự thưởng độc lập. Bộ 3 chữ số giống nhau (aaa) chỉ sinh 1 hoán vị: cả giá board lẫn xác suất/CP kỳ vọng đều chỉ bằng 1/3 bảng này, nhưng giải thưởng vẫn là giá trị Combo3 nên tỷ lệ trả thưởng KHÔNG đổi."
                  />
                </div>
                <div className="border-t overflow-x-auto">
                  <TableHeader lineCount={3} />
                  {COMBO3_FIELDS.map((p, idx) => (
                    <OddsRow
                      key={p.key}
                      field={p}
                      odds={combo3OddsMap.get(p.tier)}
                      profit={combo3ProfitMap.get(p.tier)}
                      formField={{ key: p.key, control: form.control, name: p.key }}
                      isLast={idx === COMBO3_FIELDS.length - 1}
                      totalOutcomes={BASIC_TOTAL_OUTCOMES}
                      lineCount={3}
                    />
                  ))}
                </div>

                <div className="border-t p-6 pb-4">
                  <ProfitBar
                    analysis={combo6Analysis}
                    unitPrice={unitPrice}
                    totalOutcomes={BASIC_TOTAL_OUTCOMES}
                    modeLabel="Tổ Hợp 6 (Combo6) — 6 hoán vị"
                    lineCount={6}
                    note="Bắt buộc 3 chữ số khác nhau → luôn đúng 6 hoán vị, mỗi hoán vị là 1 line dự thưởng độc lập. Giá board = 6 × giá line, giải thưởng mỗi hoán vị = giá trị Combo6."
                  />
                </div>
                <div className="border-t overflow-x-auto">
                  <TableHeader lineCount={6} />
                  {COMBO6_FIELDS.map((p, idx) => (
                    <OddsRow
                      key={p.key}
                      field={p}
                      odds={combo6OddsMap.get(p.tier)}
                      profit={combo6ProfitMap.get(p.tier)}
                      formField={{ key: p.key, control: form.control, name: p.key }}
                      isLast={idx === COMBO6_FIELDS.length - 1}
                      totalOutcomes={BASIC_TOTAL_OUTCOMES}
                      lineCount={6}
                    />
                  ))}
                </div>
              </TabsContent>

              {/* Plus */}
              <TabsContent value="plus" className="mt-0">
                <div className="p-6 pb-4">
                  <ProfitBar
                    analysis={plusAnalysis}
                    unitPrice={unitPrice}
                    totalOutcomes={PLUS_TOTAL_OUTCOMES}
                    modeLabel="Max 3D+ — 2 bộ ba số"
                    note={[
                      "Người chơi chọn 1 cặp có thứ tự (bộ 1, bộ 2) → không gian mẫu 1.000.000 cặp.",
                      "Giải cặp (ĐB → Tư) yêu cầu 2 bộ khớp 2 kết quả RIÊNG BIỆT; giải đơn (Năm, Sáu) xét từng bộ nên 1 cặp có thể trúng 2 lần.",
                      "Cặp trùng (bộ 1 = bộ 2) được nhân ×2 giải từ Nhất → Sáu. Xác suất dưới đây là số lần trúng kỳ vọng đã quy đổi ×2, các hạng cộng dồn.",
                    ]}
                  />
                </div>
                <div className="border-t overflow-x-auto">
                  <TableHeader />
                  {PLUS_FIELDS.map((p, idx) => (
                    <OddsRow
                      key={p.key}
                      field={p}
                      odds={plusOddsMap.get(p.tier)}
                      profit={plusProfitMap.get(p.tier)}
                      formField={{ key: p.key, control: form.control, name: p.key }}
                      isLast={idx === PLUS_FIELDS.length - 1}
                      totalOutcomes={PLUS_TOTAL_OUTCOMES}
                    />
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>

          <CardFooter className="justify-end border-t px-6 py-3">
            <Button type="submit" disabled={isPending || !form.formState.isDirty}>
              {isPending ? <Spinner className="mr-2" /> : <Save className="mr-2 size-4" />}
              Lưu giải thưởng
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
