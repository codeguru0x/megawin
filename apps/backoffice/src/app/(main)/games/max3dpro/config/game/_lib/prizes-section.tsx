"use client";

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save, TrendingUp, TrendingDown, Info } from "lucide-react";

import { MoneyInput } from "@megawin/ui/components/money-input";
import {
  analyzeProProfitability,
  getProOddsTable,
  PRO_TOTAL_OUTCOMES,
} from "@megawin/game-max3dpro/rules";

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

const fmt = (n: number) => n.toLocaleString("en-US");

const prizesFormSchema = z.object({
  special: z.number().int().positive("Phải > 0"),
  specialSub: z.number().int().positive("Phải > 0"),
  first: z.number().int().positive("Phải > 0"),
  second: z.number().int().positive("Phải > 0"),
  third: z.number().int().positive("Phải > 0"),
  fourth: z.number().int().positive("Phải > 0"),
  fifth: z.number().int().positive("Phải > 0"),
  sixth: z.number().int().positive("Phải > 0"),
});

type PrizesFormValues = z.infer<typeof prizesFormSchema>;

interface PrizesSectionProps {
  config: GameConfig;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
}

const STANDARD_FIELDS = [
  { key: "special" as const, tier: "special" as const, label: "Giải Đặc Biệt", desc: "2 bộ trùng đúng thứ tự 2 bộ ĐB", badge: "ĐB", color: "bg-red-600 text-white" },
  { key: "specialSub" as const, tier: "specialSub" as const, label: "Giải phụ Đặc Biệt", desc: "2 bộ trùng ngược thứ tự 2 bộ ĐB", badge: "pĐB", color: "bg-red-500 text-white" },
  { key: "first" as const, tier: "first" as const, label: "Giải Nhất", desc: "2 bộ đều trùng trong 4 bộ Nhất", badge: "1st", color: "bg-amber-500 text-white" },
  { key: "second" as const, tier: "second" as const, label: "Giải Nhì", desc: "2 bộ đều trùng trong 6 bộ Nhì", badge: "2nd", color: "bg-slate-400 text-white" },
  { key: "third" as const, tier: "third" as const, label: "Giải Ba", desc: "2 bộ đều trùng trong 8 bộ Ba", badge: "3rd", color: "bg-amber-700 text-white" },
  { key: "fourth" as const, tier: "fourth" as const, label: "Giải Tư", desc: "2 bộ trùng bất kỳ (cross-tier)", badge: "4th", color: "bg-slate-500 text-white" },
  { key: "fifth" as const, tier: "fifth" as const, label: "Giải Năm", desc: "1 bộ trùng bộ ĐB", badge: "5th", color: "bg-slate-600 text-white" },
  { key: "sixth" as const, tier: "sixth" as const, label: "Giải Sáu", desc: "1 bộ trùng bộ Nhất/Nhì/Ba", badge: "6th", color: "bg-emerald-600 text-white" },
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
      <TooltipContent side="top" className="max-w-64 text-xs">{tip}</TooltipContent>
    </Tooltip>
  );
}

interface ProfitBarProps {
  analysis: { totalExpectedPayout: number; grossMarginPercent: number; grossMarginPerLine: number };
  unitPrice: number;
  totalOutcomes: number;
  modeLabel: string;
}

function ProfitBar({ analysis, unitPrice, totalOutcomes, modeLabel }: ProfitBarProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{modeLabel}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Tổng không gian mẫu: <strong>{fmt(totalOutcomes)}</strong>
          {" · "}Giá 1 line: <strong>{fmt(unitPrice)} VND</strong>
        </p>
      </div>
      <div className="flex items-center gap-4 text-xs shrink-0">
        <div className="text-right">
          <span className="text-muted-foreground">CP kỳ vọng / line</span>
          <div className="font-semibold tabular-nums">
            {fmt(Math.round(analysis.totalExpectedPayout))} VND
          </div>
        </div>
        <div className="text-right">
          <span className="text-muted-foreground">Biên lợi nhuận gộp</span>
          <div className={`font-bold tabular-nums ${analysis.grossMarginPercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {analysis.grossMarginPercent >= 0
              ? <TrendingUp className="mr-1 inline size-3.5" />
              : <TrendingDown className="mr-1 inline size-3.5" />}
            {analysis.grossMarginPercent.toFixed(2)}%
            <span className="ml-1 font-normal text-muted-foreground">
              ({fmt(Math.round(analysis.grossMarginPerLine))} VND/line)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

const TABLE_GRID = "grid grid-cols-[auto_1fr_176px_120px_140px_100px_140px] items-center gap-3";
const TABLE_HEADER_CLS = `${TABLE_GRID} bg-muted/40 px-6 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground min-w-[960px]`;
const TABLE_ROW_CLS = `${TABLE_GRID} px-6 py-3 transition-colors hover:bg-muted/20 min-w-[960px]`;

function TableHeader() {
  return (
    <div className={TABLE_HEADER_CLS}>
      <span className="w-9" />
      <span>Hạng giải</span>
      <span className="text-right">Giá trị</span>
      <HeaderTooltip label="Xác suất" tip="Xác suất trúng giải cho 1 line. '1 : N' nghĩa là cứ N line bán ra thì kỳ vọng 1 line trúng." className="justify-end" />
      <HeaderTooltip label="CP kỳ vọng" tip="Chi phí trả thưởng kỳ vọng cho mỗi line = Xác suất × Giá trị giải." className="justify-end" />
      <HeaderTooltip label="Tỷ lệ trả" tip="Tỷ lệ trả thưởng = CP kỳ vọng ÷ Giá line × 100%. Trên 100% = LỖ." className="justify-end" />
      <HeaderTooltip label="Hoà vốn tối đa" tip="Giá trị giải thưởng tối đa để không lỗ = Giá line ÷ Xác suất." className="justify-end" />
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
}

function OddsRow({ field: p, odds, profit, formField, isLast, totalOutcomes }: OddsRowProps) {
  const isOverBreakEven = profit && profit.currentPrize > profit.breakEvenPrize;
  return (
    <FormField
      key={formField.key}
      control={formField.control}
      name={formField.name}
      render={({ field }) => (
        <FormItem>
          <div className={`${TABLE_ROW_CLS} ${isLast ? "" : "border-b"}`}>
            <Badge className={`${p.color} w-9 justify-center text-[10px] font-bold`}>{p.badge}</Badge>
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
                {odds && <>Xác suất: {(odds.probability * 100).toFixed(6)}%</>}
              </TooltipContent>
            </Tooltip>
            <span className="text-right text-xs tabular-nums font-medium">
              {profit ? `${fmt(Math.round(profit.expectedPayout))} VND` : "–"}
            </span>
            <span className={`text-right text-xs tabular-nums font-semibold ${
              profit && profit.payoutRatio > 1 ? "text-red-600"
                : profit && profit.payoutRatio > 0.5 ? "text-amber-600"
                  : "text-emerald-600"
            }`}>
              {profit ? `${(profit.payoutRatio * 100).toFixed(2)}%` : "–"}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={`text-right text-xs tabular-nums cursor-help ${isOverBreakEven ? "text-red-600 font-bold" : "text-muted-foreground"}`}>
                  {profit ? `${fmt(Math.round(profit.breakEvenPrize))} VND` : "–"}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-80 text-xs">
                {isOverBreakEven
                  ? `Giải thưởng (${fmt(profit!.currentPrize)}) vượt mức hoà vốn (${fmt(Math.round(profit!.breakEvenPrize))}) → LỖ`
                  : profit ? `Tối đa ${fmt(Math.round(profit.breakEvenPrize))} VND mà vẫn hoà vốn` : "–"}
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
      special: config.defaultPrizes.standard.special,
      specialSub: config.defaultPrizes.standard.specialSub,
      first: config.defaultPrizes.standard.first,
      second: config.defaultPrizes.standard.second,
      third: config.defaultPrizes.standard.third,
      fourth: config.defaultPrizes.standard.fourth,
      fifth: config.defaultPrizes.standard.fifth,
      sixth: config.defaultPrizes.standard.sixth,
    },
  });

  const w = form.watch();
  const unitPrice = config.play.unitPrice;

  const proOdds = useMemo(() => getProOddsTable(), []);

  const proAnalysis = useMemo(
    () => analyzeProProfitability(
      {
        special: w.special,
        specialSub: w.specialSub,
        first: w.first,
        second: w.second,
        third: w.third,
        fourth: w.fourth,
        fifth: w.fifth,
        sixth: w.sixth,
      },
      unitPrice,
    ),
    [w.special, w.specialSub, w.first, w.second, w.third, w.fourth, w.fifth, w.sixth, unitPrice],
  );

  const proProfitMap = useMemo(() => new Map(proAnalysis.tiers.map((t) => [t.tier, t])), [proAnalysis]);
  const proOddsMap = useMemo(() => new Map(proOdds.map((o) => [o.tier, o])), [proOdds]);

  function handleSubmit(values: PrizesFormValues) {
    onSave({
      defaultPrizes: {
        standard: {
          special: values.special,
          specialSub: values.specialSub,
          first: values.first,
          second: values.second,
          third: values.third,
          fourth: values.fourth,
          fifth: values.fifth,
          sixth: values.sixth,
        },
      },
    });
  }

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CardContent className="p-0">
            <div className="p-6 pb-4">
              <ProfitBar analysis={proAnalysis} unitPrice={unitPrice} totalOutcomes={PRO_TOTAL_OUTCOMES} modeLabel="Max 3D Pro — 1 cặp 2 bộ ba số" />
            </div>
            <div className="border-t overflow-x-auto">
              <TableHeader />
              {STANDARD_FIELDS.map((p, idx) => (
                <OddsRow
                  key={p.key}
                  field={p}
                  odds={proOddsMap.get(p.tier)}
                  profit={proProfitMap.get(p.tier)}
                  formField={{ key: p.key, control: form.control, name: p.key }}
                  isLast={idx === STANDARD_FIELDS.length - 1}
                  totalOutcomes={PRO_TOTAL_OUTCOMES}
                />
              ))}
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
