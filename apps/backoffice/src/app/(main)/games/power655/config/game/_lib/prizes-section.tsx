"use client";

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, TrendingUp, TrendingDown, Info } from "lucide-react";
import { formatNumber } from "@megawin/shared/utils";

import { MoneyInput } from "@megawin/ui/components/money-input";
import {
  analyzeProfitability,
  getOddsTable,
  TOTAL_MAIN_OUTCOMES,
} from "@megawin/game-power655/rules";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import type { GameConfig } from "./use-game-config";

const PRIZE_FIELDS = [
  {
    key: "tier1" as const,
    label: "Giải Nhất",
    desc: "Trùng 5/6 số",
    badge: "1st",
    color: "bg-amber-500 text-white",
  },
  {
    key: "tier2" as const,
    label: "Giải Nhì",
    desc: "Trùng 4/6 số",
    badge: "2nd",
    color: "bg-slate-400 text-white",
  },
  {
    key: "tier3" as const,
    label: "Giải Ba",
    desc: "Trùng 3/6 số",
    badge: "3rd",
    color: "bg-amber-700 text-white",
  },
] as const;

const prizesFormSchema = z.object({
  tier1: z.number().int().positive("Phải > 0"),
  tier2: z.number().int().positive("Phải > 0"),
  tier3: z.number().int().positive("Phải > 0"),
});

type PrizesFormValues = z.infer<typeof prizesFormSchema>;

interface PrizesSectionProps {
  config: GameConfig;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
}

const oddsTable = getOddsTable();
const oddsMap = new Map(oddsTable.map((o) => [o.tier, o]));

const fmt = formatNumber;

function formatProbability(p: number): string {
  if (p <= 0) return "0";
  if (p >= 1) return "1";
  const inverse = Math.round(1 / p);
  return `1 / ${formatNumber(inverse)}`;
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

export function PrizesSection({ config, onSave, isPending }: PrizesSectionProps) {
  const form = useForm<PrizesFormValues>({
    resolver: zodResolver(prizesFormSchema),
    values: { ...config.defaultPrizes },
  });

  const watchedValues = form.watch();
  const unitPrice = config.play.unitPrice;

  const profitAnalysis = useMemo(
    () => analyzeProfitability(watchedValues, unitPrice),
    [watchedValues, unitPrice],
  );

  const profitMap = useMemo(
    () => new Map(profitAnalysis.tiers.map((t) => [t.tier, t])),
    [profitAnalysis],
  );

  function handleSubmit(values: PrizesFormValues) {
    onSave({ defaultPrizes: values });
  }

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="p-0">
            <div className="p-6 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Bảng giải thưởng cố định
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Giá trị giải thưởng mặc định (VND). Jackpot 1 &amp; Jackpot 2 là giải tích luỹ.
                    {" · "}Tổng không gian mẫu: <strong>{fmt(TOTAL_MAIN_OUTCOMES)}</strong>
                    {" · "}Giá 1 line: <strong>{fmt(unitPrice)} VND</strong>
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs shrink-0">
                  <div className="text-right">
                    <span className="text-muted-foreground">Trả thưởng kỳ vọng / line</span>
                    <div className="font-semibold tabular-nums">
                      {fmt(Math.round(profitAnalysis.totalExpectedPayout))} VND
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground">Biên lợi nhuận gộp</span>
                    <div
                      className={`font-bold tabular-nums ${
                        profitAnalysis.grossMarginPercent >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {profitAnalysis.grossMarginPercent >= 0 ? (
                        <TrendingUp className="mr-1 inline size-3.5" />
                      ) : (
                        <TrendingDown className="mr-1 inline size-3.5" />
                      )}
                      {profitAnalysis.grossMarginPercent.toFixed(2)}%
                      <span className="ml-1 font-normal text-muted-foreground">
                        ({fmt(Math.round(profitAnalysis.grossMarginPerLine))} VND/line)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t overflow-x-auto">
              {/* Table header */}
              <div className="grid grid-cols-[auto_1fr_176px_120px_120px_140px_100px_140px] items-center gap-3 bg-muted/40 px-6 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground min-w-[1060px]">
                <span className="w-9" />
                <span>Hạng giải</span>
                <span className="text-right">Giá trị mới</span>
                <span className="text-right">Hiện tại</span>
                <HeaderTooltip
                  label="Xác suất"
                  tip="Xác suất trúng giải cho 1 line. Hiển thị dạng '1 : N' nghĩa là cứ N line bán ra thì kỳ vọng có 1 line trúng giải này."
                  className="justify-end"
                />
                <HeaderTooltip
                  label="CP kỳ vọng"
                  tip="Chi phí trả thưởng kỳ vọng cho mỗi line bán ra ở giải này. Công thức: Xác suất × Giá trị giải thưởng."
                  className="justify-end"
                />
                <HeaderTooltip
                  label="Tỷ lệ trả"
                  tip="Tỷ lệ trả thưởng = Chi phí kỳ vọng ÷ Giá 1 line × 100%. Trên 100% nghĩa là giải này đang LỖ."
                  className="justify-end"
                />
                <HeaderTooltip
                  label="Tối đa hoà vốn"
                  tip="Giá trị giải thưởng tối đa để giải này không bị lỗ. Công thức: Giá 1 line ÷ Xác suất."
                  className="justify-end"
                />
              </div>

              {/* Table rows */}
              {PRIZE_FIELDS.map((p, idx) => {
                const odds = oddsMap.get(p.key);
                const profit = profitMap.get(p.key);
                const isOverBreakEven = profit && profit.currentPrize > profit.breakEvenPrize;

                return (
                  <FormField
                    key={p.key}
                    control={form.control}
                    name={p.key}
                    render={({ field }) => (
                      <FormItem>
                        <div
                          className={`grid grid-cols-[auto_1fr_176px_120px_120px_140px_100px_140px] items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/20 min-w-[1060px] ${
                            idx < PRIZE_FIELDS.length - 1 ? "border-b" : ""
                          }`}
                        >
                          <Badge className={`${p.color} w-9 justify-center text-[10px] font-bold`}>
                            {p.badge}
                          </Badge>
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
                          <span className="text-right text-xs tabular-nums text-muted-foreground">
                            {fmt(config.defaultPrizes[p.key])} VND
                          </span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-right text-xs tabular-nums text-muted-foreground cursor-help">
                                {odds ? `1 : ${fmt(Math.round(odds.oneInN))}` : "–"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-72 text-xs">
                              {odds && (
                                <>
                                  Số cách trúng: {fmt(odds.ways)} / {fmt(TOTAL_MAIN_OUTCOMES)}
                                  <br />
                                  Xác suất: {(odds.probability * 100).toFixed(6)}%
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
                                className={`text-right text-xs tabular-nums cursor-help ${
                                  isOverBreakEven
                                    ? "text-red-600 font-bold"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {profit ? `${fmt(Math.round(profit.breakEvenPrize))} VND` : "–"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-80 text-xs">
                              {isOverBreakEven
                                ? `Giải thưởng hiện tại (${fmt(profit!.currentPrize)} VND) đã vượt mức hoà vốn (${fmt(Math.round(profit!.breakEvenPrize))} VND) → giải này đang LỖ`
                                : profit
                                  ? `Có thể đặt giải thưởng tối đa ${fmt(Math.round(profit.breakEvenPrize))} VND mà vẫn hoà vốn cho giải này`
                                  : "–"}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <FormMessage className="px-6" />
                      </FormItem>
                    )}
                  />
                );
              })}
            </div>

            {/* Full odds reference table */}
            <div className="border-t px-6 py-5">
              <h4 className="mb-3 text-xs font-semibold text-foreground">
                Bảng xác suất &amp; tỷ lệ trả thưởng toàn bộ (bao gồm Jackpot 1/Jackpot 2)
              </h4>
              <div className="overflow-x-auto">
                {/* Header */}
                <div className="grid grid-cols-[1fr_140px_160px_140px_100px] items-center gap-3 rounded-t-md bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground min-w-[720px]">
                  <span>Hạng giải</span>
                  <HeaderTooltip
                    label="Xác suất"
                    tip="Cứ bán N dòng thì kỳ vọng có 1 dòng trúng giải. Số càng lớn nghĩa là giải càng khó trúng."
                    className="justify-end"
                  />
                  <span className="text-right">Giải thưởng mặc định</span>
                  <HeaderTooltip
                    label="CP kỳ vọng / line"
                    tip="Với Jackpot 1/Jackpot 2 là giải tích luỹ, chi phí kỳ vọng = Xác suất × Giá trị khởi điểm tối thiểu. Thực tế khi jackpot tích luỹ lớn, chi phí sẽ cao hơn."
                    className="justify-end"
                  />
                  <HeaderTooltip
                    label="Tỷ lệ KH"
                    tip="Tỷ lệ trả thưởng kế hoạch theo thể lệ Vietlott. Tổng 55% doanh thu trả thưởng."
                    className="justify-end"
                  />
                </div>

                {/* Rows */}
                {oddsTable.map((row, idx) => {
                  const isJackpot = row.tier === "jackpot1" || row.tier === "jackpot2";
                  const defaultPrize = isJackpot
                    ? row.tier === "jackpot1"
                      ? config.jackpot.jackpot1.seedAmount
                      : config.jackpot.jackpot2.seedAmount
                    : (config.defaultPrizes[row.tier as keyof typeof config.defaultPrizes] ?? 0);
                  const expectedPayout = row.probability * defaultPrize;

                  return (
                    <div
                      key={row.tier}
                      className={`grid grid-cols-[1fr_140px_160px_140px_100px] items-center gap-3 px-4 py-2.5 text-xs transition-colors hover:bg-muted/20 min-w-[720px] ${
                        idx < oddsTable.length - 1 ? "border-b" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {isJackpot && (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              row.tier === "jackpot1"
                                ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
                                : "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                            }`}
                          >
                            {row.tier === "jackpot1" ? "Jackpot 1" : "Jackpot 2"}
                          </span>
                        )}
                        <span className="font-medium text-foreground">{row.label}</span>
                      </div>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help text-right tabular-nums text-muted-foreground">
                            1 : {fmt(Math.round(row.oneInN))}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-72 text-xs">
                          Số cách trúng: {fmt(Math.round(row.ways))} / {fmt(TOTAL_MAIN_OUTCOMES)}
                          <br />
                          Giá trị chính xác: {row.probability.toExponential(4)}
                        </TooltipContent>
                      </Tooltip>

                      <span className="text-right tabular-nums text-muted-foreground">
                        {isJackpot ? (
                          <span className="italic">Khởi điểm: {fmt(defaultPrize)}</span>
                        ) : (
                          `${fmt(defaultPrize)} VND`
                        )}
                      </span>

                      <span className="text-right tabular-nums font-medium">
                        {fmt(Math.round(expectedPayout))} VND
                      </span>

                      <span className="text-right tabular-nums font-semibold text-violet-600 dark:text-violet-400">
                        {row.plannedPayoutRate.toFixed(2)}%
                      </span>
                    </div>
                  );
                })}

                {/* Total row */}
                <div className="grid grid-cols-[1fr_140px_160px_140px_100px] items-center gap-3 rounded-b-md border-t-2 bg-muted/30 px-4 py-2.5 text-xs font-semibold min-w-[720px]">
                  <span>Tổng cộng</span>
                  <span />
                  <span />
                  <span className="text-right tabular-nums">
                    {fmt(
                      Math.round(
                        oddsTable.reduce((sum, row) => {
                          const isJP = row.tier === "jackpot1" || row.tier === "jackpot2";
                          const prize = isJP
                            ? row.tier === "jackpot1"
                              ? config.jackpot.jackpot1.seedAmount
                              : config.jackpot.jackpot2.seedAmount
                            : (config.defaultPrizes[
                                row.tier as keyof typeof config.defaultPrizes
                              ] ?? 0);
                          return sum + row.probability * prize;
                        }, 0),
                      ),
                    )}{" "}
                    VND
                  </span>
                  <span className="text-right tabular-nums text-violet-700 dark:text-violet-300">
                    {oddsTable.reduce((sum, row) => sum + row.plannedPayoutRate, 0).toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
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
