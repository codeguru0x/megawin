"use client";

import { useMemo } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { analyzeProfitability, getOddsTable, TOTAL_OUTCOMES } from "@megawin/game-lotto535/rules";
import { formatNumber } from "@megawin/shared/utils";
import { MoneyInput } from "@megawin/ui/components/money-input";
import { Info, Save, TrendingDown, TrendingUp } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAiFormDirty } from "@/hooks/use-ai-form-dirty";

import type { GameConfig } from "./use-game-config";

const PRIZE_FIELDS = [
  {
    key: "tier1" as const,
    label: "Giải Nhất",
    desc: "5 số chính",
    badge: "1st",
    color: "bg-amber-500 text-white",
  },
  {
    key: "tier2" as const,
    label: "Giải Nhì",
    desc: "4 chính + ĐB",
    badge: "2nd",
    color: "bg-slate-400 text-white",
  },
  {
    key: "tier3" as const,
    label: "Giải Ba",
    desc: "4 số chính",
    badge: "3rd",
    color: "bg-amber-700 text-white",
  },
  {
    key: "tier4" as const,
    label: "Giải Tư",
    desc: "3 chính + ĐB",
    badge: "4th",
    color: "bg-slate-500 text-white",
  },
  {
    key: "tier5" as const,
    label: "Giải Năm",
    desc: "3 số chính",
    badge: "5th",
    color: "bg-slate-600 text-white",
  },
  {
    key: "consolation" as const,
    label: "Khuyến Khích",
    desc: "≤2 chính + ĐB",
    badge: "KK",
    color: "bg-emerald-600 text-white",
  },
] as const;

const prizesFormSchema = z.object({
  tier1: z.number().int().positive("Phải > 0"),
  tier2: z.number().int().positive("Phải > 0"),
  tier3: z.number().int().positive("Phải > 0"),
  tier4: z.number().int().positive("Phải > 0"),
  tier5: z.number().int().positive("Phải > 0"),
  consolation: z.number().int().positive("Phải > 0"),
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

export function PrizesSection({ config, onSave, isPending }: PrizesSectionProps) {
  const form = useForm<PrizesFormValues>({
    resolver: zodResolver(prizesFormSchema),
    values: { ...config.defaultPrizes },
  });

  useAiFormDirty("prizes", form.formState.isDirty);

  const watchedValues = form.watch();
  const unitPrice = config.play.unitPrice;

  const profitAnalysis = useMemo(() => analyzeProfitability(watchedValues, unitPrice), [watchedValues, unitPrice]);

  const profitMap = useMemo(() => new Map(profitAnalysis.tiers.map((t) => [t.tier, t])), [profitAnalysis]);

  function handleSubmit(values: PrizesFormValues) {
    onSave({ defaultPrizes: values });
  }

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="p-0">
            <div className="grid gap-0 lg:grid-cols-[3fr_2fr]">
              {/* ── Left: Editable prizes ─────────────────────── */}
              <div className="overflow-x-auto p-6">
                <div className="mb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Bảng giải thưởng cố định</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Giá trị giải thưởng mặc định (VND) — Jackpot Độc Đắc là giải tích luỹ riêng
                        {" · "}Mẫu: <strong>{fmt(TOTAL_OUTCOMES)}</strong>
                        {" · "}Giá: <strong>{fmt(unitPrice)} VND</strong>
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-xs shrink-0">
                      <div className="text-right">
                        <span className="text-muted-foreground">Kỳ vọng trả / line</span>
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

                <div className="rounded-lg border overflow-hidden">
                  {/* Table header */}
                  <div className="grid grid-cols-[auto_1fr_152px_112px_112px_96px_116px] items-center gap-3 bg-muted/40 px-6 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground min-w-205">
                    <span className="w-9" />
                    <span>Hạng giải</span>
                    <span className="text-right">Giá trị thưởng</span>
                    <HeaderTooltip
                      label="Xác suất"
                      tip="Xác suất trúng giải cho 1 line. '1 : N' nghĩa là cứ N line bán ra thì kỳ vọng 1 line trúng."
                      className="justify-end"
                    />
                    <HeaderTooltip
                      label="CP kỳ vọng"
                      tip="Chi phí trả thưởng kỳ vọng / line. Công thức: Xác suất × Giá trị giải."
                      className="justify-end"
                    />
                    <HeaderTooltip
                      label="Tỷ lệ TT"
                      tip="Tỷ lệ trả thưởng = CP kỳ vọng ÷ Giá 1 line × 100%. Trên 100% = LỖ."
                      className="justify-end"
                    />
                    <HeaderTooltip
                      label="Hoà vốn"
                      tip="Giá trị giải tối đa để không lỗ. Công thức: Giá 1 line ÷ Xác suất."
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
                              className={`grid grid-cols-[auto_1fr_152px_112px_112px_96px_116px] items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/20 min-w-205 ${
                                idx < PRIZE_FIELDS.length - 1 ? "border-b" : ""
                              }`}
                            >
                              <Badge className={`${p.color} w-9 justify-center text-xs font-bold`}>{p.badge}</Badge>
                              <div>
                                <span className="text-sm font-medium">{p.label}</span>
                                <span className="ml-2 text-xs text-muted-foreground">{p.desc}</span>
                              </div>
                              <FormControl>
                                <MoneyInput
                                  className="w-36 text-right font-semibold"
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
                                      Số cách trúng: {fmt(odds.ways)} / {fmt(TOTAL_OUTCOMES)}
                                      <br />
                                      Xác suất: {(odds.probability * 100).toFixed(6)}%
                                    </>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                              <span className="text-right text-xs tabular-nums font-medium">
                                {profit ? `${fmt(Math.round(profit.expectedPayout))}` : "–"}
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
                                      isOverBreakEven ? "text-red-600 font-bold" : "text-muted-foreground"
                                    }`}
                                  >
                                    {profit ? `${fmt(Math.round(profit.breakEvenPrize))}` : "–"}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-80 text-xs">
                                  {isOverBreakEven
                                    ? `Giải thưởng hiện tại (${fmt(profit!.currentPrize)}) đã vượt mức hoà vốn (${fmt(Math.round(profit!.breakEvenPrize))}) → LỖ`
                                    : profit
                                      ? `Tối đa ${fmt(Math.round(profit.breakEvenPrize))} VND mà vẫn hoà vốn`
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
              </div>

              {/* ── Right: Full odds reference ────────────────── */}
              <div className="border-t p-6 lg:border-l lg:border-t-0 overflow-x-auto">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-foreground">Xác suất &amp; tỷ lệ trả thưởng</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Toàn bộ hạng giải bao gồm Jackpot Độc Đắc.</p>
                </div>

                <div className="rounded-lg border overflow-hidden">
                  {/* Header */}
                  <div className="grid grid-cols-[1fr_112px_120px_108px_88px] items-center gap-3 bg-muted/40 px-6 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground min-w-140">
                    <span>Hạng giải</span>
                    <span className="text-right">Xác suất</span>
                    <span className="text-right">Giá trị</span>
                    <HeaderTooltip
                      label="CP kỳ vọng"
                      tip="Chi phí kỳ vọng / line = Xác suất × Giá trị giải. Với Jackpot là giá trị khởi điểm."
                      className="justify-end"
                    />
                    <HeaderTooltip
                      label="Tỷ lệ TT"
                      tip="Tỷ lệ trả thưởng = CP kỳ vọng ÷ Giá 1 line × 100%."
                      className="justify-end"
                    />
                  </div>

                  {/* Rows */}
                  {oddsTable.map((row, idx) => {
                    const isJackpot = row.tier === "jackpot";
                    const defaultPrize = isJackpot
                      ? config.jackpot.seedAmount
                      : (config.defaultPrizes[row.tier as keyof typeof config.defaultPrizes] ?? 0);
                    const expectedPayout = row.probability * defaultPrize;
                    const payoutRate = unitPrice > 0 ? (expectedPayout / unitPrice) * 100 : 0;

                    return (
                      <div
                        key={row.tier}
                        className={`grid grid-cols-[1fr_112px_120px_108px_88px] items-center gap-3 px-6 py-3 text-xs transition-colors hover:bg-muted/20 min-w-140 ${
                          idx < oddsTable.length - 1 ? "border-b" : ""
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {isJackpot && (
                            <Badge
                              variant="secondary"
                              className="text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
                            >
                              JP
                            </Badge>
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
                            Số cách trúng: {fmt(Math.round(row.ways))} / {fmt(TOTAL_OUTCOMES)}
                            <br />
                            Xác suất: {(row.probability * 100).toFixed(6)}%
                          </TooltipContent>
                        </Tooltip>

                        <span className="text-right tabular-nums text-muted-foreground">{fmt(defaultPrize)}</span>

                        <span className="text-right tabular-nums font-medium">{fmt(Math.round(expectedPayout))}</span>

                        <span className="text-right tabular-nums font-semibold text-muted-foreground">
                          {payoutRate.toFixed(2)}%
                        </span>
                      </div>
                    );
                  })}

                  {/* Total row */}
                  <div className="grid grid-cols-[1fr_112px_120px_108px_88px] items-center gap-3 rounded-b-md border-t-2 bg-muted/30 px-6 py-2.5 text-xs font-semibold uppercase tracking-wider min-w-140">
                    <span>Tổng cộng</span>
                    <span />
                    <span />
                    <span className="text-right tabular-nums">
                      {fmt(
                        Math.round(
                          oddsTable.reduce((sum, row) => {
                            const isJP = row.tier === "jackpot";
                            const prize = isJP
                              ? config.jackpot.seedAmount
                              : (config.defaultPrizes[row.tier as keyof typeof config.defaultPrizes] ?? 0);
                            return sum + row.probability * prize;
                          }, 0),
                        ),
                      )}
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">
                      {oddsTable
                        .reduce((sum, row) => {
                          const isJP = row.tier === "jackpot";
                          const prize = isJP
                            ? config.jackpot.seedAmount
                            : (config.defaultPrizes[row.tier as keyof typeof config.defaultPrizes] ?? 0);
                          const ep = row.probability * prize;
                          return sum + (unitPrice > 0 ? (ep / unitPrice) * 100 : 0);
                        }, 0)
                        .toFixed(2)}
                      %
                    </span>
                  </div>
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
