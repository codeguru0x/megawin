"use client";

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, TrendingUp, TrendingDown, Info } from "lucide-react";

import { MoneyInput } from "@megawin/ui/components/money-input";
import {
  analyzeProfitability,
  getOddsTable,
  TOTAL_OUTCOMES,
} from "@megawin/game-lotto535/rules";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
    desc: "Chỉ số ĐB",
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

const fmt = (n: number) => n.toLocaleString("en-US");

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
        <span
          className={`inline-flex items-center gap-1 cursor-help ${className ?? ""}`}
        >
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

export function PrizesSection({
  config,
  onSave,
  isPending,
}: PrizesSectionProps) {
  const form = useForm<PrizesFormValues>({
    resolver: zodResolver(prizesFormSchema),
    values: { ...config.defaultPrizes },
  });

  const watchedValues = form.watch();
  const unitPrice = config.play.unitPrice;

  const profitAnalysis = useMemo(
    () => analyzeProfitability(watchedValues, unitPrice),
    [watchedValues, unitPrice]
  );

  const profitMap = useMemo(
    () => new Map(profitAnalysis.tiers.map((t) => [t.tier, t])),
    [profitAnalysis]
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
                    Giá trị giải thưởng mặc định cho từng hạng giải (VND)
                    {" · "}Tổng không gian mẫu:{" "}
                    <strong>{fmt(TOTAL_OUTCOMES)}</strong>
                    {" · "}Giá 1 line: <strong>{fmt(unitPrice)} VND</strong>
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs shrink-0">
                  <div className="text-right">
                    <span className="text-muted-foreground">
                      Trả thưởng kỳ vọng / line
                    </span>
                    <div className="font-semibold tabular-nums">
                      {fmt(Math.round(profitAnalysis.totalExpectedPayout))} VND
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground">
                      Biên lợi nhuận gộp
                    </span>
                    <div
                      className={`font-bold tabular-nums ${
                        profitAnalysis.grossMarginPercent >= 0
                          ? "text-emerald-600"
                          : "text-red-600"
                      }`}
                    >
                      {profitAnalysis.grossMarginPercent >= 0 ? (
                        <TrendingUp className="mr-1 inline size-3.5" />
                      ) : (
                        <TrendingDown className="mr-1 inline size-3.5" />
                      )}
                      {profitAnalysis.grossMarginPercent.toFixed(2)}%
                      <span className="ml-1 font-normal text-muted-foreground">
                        ({fmt(Math.round(profitAnalysis.grossMarginPerLine))}{" "}
                        VND/line)
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
                  tip="Chi phí trả thưởng kỳ vọng cho mỗi line bán ra ở giải này. Công thức: Xác suất × Giá trị giải thưởng. Đây là số tiền trung bình công ty phải trả cho giải này trên mỗi line."
                  className="justify-end"
                />
                <HeaderTooltip
                  label="Tỷ lệ trả"
                  tip="Tỷ lệ trả thưởng = Chi phí kỳ vọng ÷ Giá 1 line × 100%. Trên 100% nghĩa là giải này đang LỖ — trả nhiều hơn thu. Dưới 100% là có lãi."
                  className="justify-end"
                />
                <HeaderTooltip
                  label="Tối đa hoà vốn"
                  tip="Giá trị giải thưởng tối đa để giải này không bị lỗ. Công thức: Giá 1 line ÷ Xác suất. Nếu đặt giải thưởng vượt số này, giải đó sẽ lỗ về mặt kỳ vọng toán học."
                  className="justify-end"
                />
              </div>

              {/* Table rows */}
              {PRIZE_FIELDS.map((p, idx) => {
                const odds = oddsMap.get(p.key);
                const profit = profitMap.get(p.key);
                const isOverBreakEven =
                  profit && profit.currentPrize > profit.breakEvenPrize;

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
                          <Badge
                            className={`${p.color} w-9 justify-center text-[10px] font-bold`}
                          >
                            {p.badge}
                          </Badge>
                          <div>
                            <span className="text-sm font-medium">
                              {p.label}
                            </span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {p.desc}
                            </span>
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
                                {odds
                                  ? `1 : ${fmt(Math.round(odds.oneInN))}`
                                  : "–"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="max-w-72 text-xs"
                            >
                              {odds && (
                                <>
                                  Số cách trúng: {fmt(odds.ways)} /{" "}
                                  {fmt(TOTAL_OUTCOMES)}
                                  <br />
                                  Xác suất:{" "}
                                  {(odds.probability * 100).toFixed(6)}%
                                </>
                              )}
                            </TooltipContent>
                          </Tooltip>
                          <span className="text-right text-xs tabular-nums font-medium">
                            {profit
                              ? `${fmt(Math.round(profit.expectedPayout))} VND`
                              : "–"}
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
                            {profit
                              ? `${(profit.payoutRatio * 100).toFixed(2)}%`
                              : "–"}
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
                                {profit
                                  ? `${fmt(Math.round(profit.breakEvenPrize))} VND`
                                  : "–"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="max-w-80 text-xs"
                            >
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
          </CardContent>

          <CardFooter className="justify-end border-t px-6 py-3">
            <Button
              type="submit"
              disabled={isPending || !form.formState.isDirty}
            >
              {isPending ? (
                <Spinner className="mr-2" />
              ) : (
                <Save className="mr-2 size-4" />
              )}
              Lưu giải thưởng
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
