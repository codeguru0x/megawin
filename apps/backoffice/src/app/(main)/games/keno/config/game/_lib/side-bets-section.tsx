"use client";

import { useMemo, useState } from "react";

import type { BigSmallPrizes, EvenOddPrizes } from "@megawin/game-keno/entities";
import {
  analyzeBigSmallProfitability,
  analyzeEvenOddProfitability,
  getBigSmallOdds,
  getEvenOddOdds,
  type SideBetProfitAnalysis,
  TOTAL_OUTCOMES,
} from "@megawin/game-keno/rules";
import { formatNumber } from "@megawin/shared/utils";
import { MoneyInput } from "@megawin/ui/components/money-input";
import { ChevronDown, ChevronUp, Info, Save, TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { KenoGameConfig } from "./use-game-config";

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

/**
 * Một CỬA CƯỢC (thứ người chơi thực sự đặt) có thể thắng ở NHIỀU mức kết quả.
 * Ví dụ: đặt "Lớn" thắng cả khi bigCount ≥ 13 (giải cao) và khi 11-12 (giải thấp).
 *
 * Vì vậy tỷ lệ trả thưởng THẬT của 1 cửa = TỔNG tỷ lệ các mức nó thắng.
 * Nhóm dưới đây khớp 1:1 với các nhánh `matchBigSmallBet` / `matchEvenOddBet`.
 */
interface BetGroupDef {
  /** Tên cửa cược hiển thị cho staff (đúng như player thấy khi đặt cược). */
  label: string;
  /** Các mức kết quả (key giải thưởng) mà cửa này được trả thưởng. */
  keys: readonly string[];
}

/** Cửa cược Lớn/Nhỏ — "Hoà" là cửa riêng, KHÔNG trả cho cửa Lớn hay Nhỏ. */
const BS_BETS: readonly BetGroupDef[] = [
  { label: "Lớn", keys: ["big13Plus", "big1112"] },
  { label: "Hoà L/N", keys: ["draw"] },
  { label: "Nhỏ", keys: ["small13Plus", "small1112"] },
];

/** Cửa cược Chẵn/Lẻ — 5 cửa độc lập (Chẵn, Chẵn 11-12, Hoà, Lẻ 11-12, Lẻ). */
const EO_BETS: readonly BetGroupDef[] = [
  { label: "Chẵn", keys: ["even15Plus", "even1314"] },
  { label: "Chẵn 11-12", keys: ["even1112"] },
  { label: "Hoà C/L", keys: ["draw"] },
  { label: "Lẻ 11-12", keys: ["odd1112"] },
  { label: "Lẻ", keys: ["odd1314", "odd15Plus"] },
];

/** Tỷ lệ trả thưởng tổng hợp của 1 cửa cược. */
interface BetSummary {
  label: string;
  /** RTP thật của cửa = Σ(xác suất × giải) các mức cửa này thắng, ÷ giá 1 line. */
  payoutRatio: number;
  /** Biên lợi nhuận kỳ vọng của cửa (%) = (1 − payoutRatio) × 100. */
  marginPercent: number;
}

/**
 * Gộp tỷ lệ trả thưởng của các mức kết quả về từng CỬA CƯỢC người chơi đặt.
 *
 * `tiers` đến từ `analyzeBigSmallProfitability` / `analyzeEvenOddProfitability`
 * và có thứ tự trùng khớp với `fields` — map theo index để lấy ratio từng mức.
 */
function buildBetSummaries(
  bets: readonly BetGroupDef[],
  fields: readonly { key: string }[],
  tiers: SideBetProfitAnalysis[],
): BetSummary[] {
  const ratioByKey = new Map<string, number>();
  for (const [i, f] of fields.entries()) {
    ratioByKey.set(f.key, tiers[i]?.payoutRatio ?? 0);
  }

  return bets.map((bet) => {
    let payoutRatio = 0;
    for (const key of bet.keys) {
      payoutRatio += ratioByKey.get(key) ?? 0;
    }
    return { label: bet.label, payoutRatio, marginPercent: (1 - payoutRatio) * 100 };
  });
}

/** Dải hiển thị RTP theo từng cửa cược — con số staff cần nhìn để quyết định giá giải. */
function BetRtpStrip({ summaries }: { summaries: BetSummary[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/30 px-2 py-1.5 text-xs">
      <HeaderTooltip
        label="Tỷ lệ TT theo cửa cược"
        tip="Người chơi đặt theo CỬA (Lớn / Nhỏ / Hoà / Chẵn / Lẻ…), không đặt theo từng mức kết quả. Một cửa thắng ở nhiều mức nên RTP thật = TỔNG tỷ lệ các mức đó. Đây là con số quyết định lãi/lỗ, > 100% = LỖ."
        className="font-medium text-muted-foreground"
      />
      {summaries.map((b) => (
        <span
          key={b.label}
          className={cn(
            "tabular-nums font-semibold",
            b.payoutRatio > 1 ? "text-red-600" : b.payoutRatio > 0.8 ? "text-amber-600" : "text-emerald-600",
          )}
        >
          {b.label}: {(b.payoutRatio * 100).toFixed(1)}%
        </span>
      ))}
    </div>
  );
}

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
  const analysis = useMemo(() => analyzeBigSmallProfitability(prizes, unitPrice), [prizes, unitPrice]);

  // Biên phải tính theo CỬA CƯỢC, không theo từng dòng kết quả: đặt "Lớn" được trả
  // ở cả mức ≥13 và 11-12 → nhìn riêng từng dòng sẽ đánh giá THẤP hơn rủi ro thật.
  const betSummaries = useMemo(() => buildBetSummaries(BS_BETS, BS_FIELDS, analysis.tiers), [analysis.tiers]);
  const overBetCount = betSummaries.filter((b) => b.payoutRatio > 1).length;

  const worstMargin = Math.min(...betSummaries.map((b) => b.marginPercent));
  const bestMargin = Math.max(...betSummaries.map((b) => b.marginPercent));
  const allSafe = overBetCount === 0;

  const marginColor = worstMargin >= 50 ? "text-emerald-600" : worstMargin >= 0 ? "text-amber-600" : "text-red-600";

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
              Biên thấp nhất theo cửa: {worstMargin.toFixed(1)}%
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
          <BetRtpStrip summaries={betSummaries} />
          <div className="grid grid-cols-[2fr_160px_100px_120px_100px_120px] items-center gap-2 bg-muted/40 px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {" "}
            <span>Kết quả</span>
            <span className="text-right">Giá trị thưởng</span>
            <HeaderTooltip
              label="Xác suất"
              tip="1 trong N: cứ N kỳ quay thì kỳ vọng xảy ra 1 lần. Hover vào từng ô để xem % chính xác."
              className="justify-end"
            />
            <HeaderTooltip
              label="CP kỳ vọng"
              tip="Chi phí trả thưởng kỳ vọng = xác suất × giải thưởng."
              className="justify-end"
            />
            <HeaderTooltip
              label="Tỷ lệ TT"
              tip="Tỷ lệ trả thưởng CỦA RIÊNG MỨC NÀY = CP kỳ vọng ÷ Giá 1 line. Cửa cược (Lớn/Nhỏ) thắng ở nhiều mức nên phải xem dải 'Tỷ lệ TT theo cửa cược' phía trên để biết rủi ro thật."
              className="justify-end"
            />
            <HeaderTooltip
              label="Hoà vốn"
              tip="Giá trị giải thưởng tối đa để RIÊNG mức này không lỗ. Cửa thắng nhiều mức thì phải hạ thấp hơn con số này."
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
                      {`1 : ${fmt(Math.round(1 / odds.probability))}`}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-72 text-xs">
                    Số cách trúng: {fmt(Number(odds.waysBig))} / {fmt(Number(TOTAL_OUTCOMES))}
                    <br />
                    Xác suất: {(odds.probability * 100).toFixed(4)}%
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
              Tổng Lớn/Nhỏ · {overBetCount > 0 ? `${overBetCount} cửa cược vượt hoà vốn` : "Tất cả cửa cược an toàn"}
            </span>
            <span className={cn("text-xs font-bold tabular-nums", marginColor)}>
              {allSafe ? (
                <TrendingUp className="mr-1 inline size-3" />
              ) : (
                <TrendingDown className="mr-1 inline size-3" />
              )}
              Biên theo cửa: {worstMargin.toFixed(1)}%{" ~ "}
              {bestMargin.toFixed(1)}%
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
  const analysis = useMemo(() => analyzeEvenOddProfitability(prizes, unitPrice), [prizes, unitPrice]);

  // Cửa "Chẵn" thắng ở cả mức ≥15 và 13-14; cửa "Lẻ" đối xứng. Đánh giá theo cửa
  // mới ra rủi ro thật — xem từng dòng riêng sẽ báo an toàn ảo.
  const betSummaries = useMemo(() => buildBetSummaries(EO_BETS, EO_FIELDS, analysis.tiers), [analysis.tiers]);
  const overBetCount = betSummaries.filter((b) => b.payoutRatio > 1).length;

  const worstMargin = Math.min(...betSummaries.map((b) => b.marginPercent));
  const bestMargin = Math.max(...betSummaries.map((b) => b.marginPercent));
  const allSafe = overBetCount === 0;

  const marginColor = worstMargin >= 50 ? "text-emerald-600" : worstMargin >= 0 ? "text-amber-600" : "text-red-600";

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
              Biên thấp nhất theo cửa: {worstMargin.toFixed(1)}%
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
          <BetRtpStrip summaries={betSummaries} />
          <div className="grid grid-cols-[2fr_160px_100px_120px_100px_120px] items-center gap-2 bg-muted/40 px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {" "}
            <span>Kết quả</span>
            <span className="text-right">Giá trị thưởng</span>
            <HeaderTooltip
              label="Xác suất"
              tip="1 trong N: cứ N kỳ quay thì kỳ vọng xảy ra 1 lần. Hover vào từng ô để xem % chính xác."
              className="justify-end"
            />
            <HeaderTooltip
              label="CP kỳ vọng"
              tip="Chi phí trả thưởng kỳ vọng = xác suất × giải thưởng."
              className="justify-end"
            />
            <HeaderTooltip
              label="Tỷ lệ TT"
              tip="Tỷ lệ trả thưởng CỦA RIÊNG MỨC NÀY = CP kỳ vọng ÷ Giá 1 line. Cửa Chẵn/Lẻ thắng ở nhiều mức nên phải xem dải 'Tỷ lệ TT theo cửa cược' phía trên để biết rủi ro thật."
              className="justify-end"
            />
            <HeaderTooltip
              label="Hoà vốn"
              tip="Giá trị giải thưởng tối đa để RIÊNG mức này không lỗ. Cửa thắng nhiều mức thì phải hạ thấp hơn con số này."
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
                      {`1 : ${fmt(Math.round(1 / odds.probability))}`}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-72 text-xs">
                    Số cách trúng: {fmt(Number(odds.waysBig))} / {fmt(Number(TOTAL_OUTCOMES))}
                    <br />
                    Xác suất: {(odds.probability * 100).toFixed(4)}%
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
              Tổng Chẵn/Lẻ · {overBetCount > 0 ? `${overBetCount} cửa cược vượt hoà vốn` : "Tất cả cửa cược an toàn"}
            </span>
            <span className={cn("text-xs font-bold tabular-nums", marginColor)}>
              {allSafe ? (
                <TrendingUp className="mr-1 inline size-3" />
              ) : (
                <TrendingDown className="mr-1 inline size-3" />
              )}
              Biên theo cửa: {worstMargin.toFixed(1)}%{" ~ "}
              {bestMargin.toFixed(1)}%
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
        <div className="p-6 pb-4">
          <h3 className="text-sm font-semibold text-foreground">Giải thưởng bổ sung – Lớn/Nhỏ & Chẵn/Lẻ</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Giải thưởng cho cách chơi bổ sung (Lớn/Nhỏ, Chẵn/Lẻ)
            {" · "}Mệnh giá: <strong>{fmt(unitPrice)} VND</strong>
          </p>
        </div>

        <div className="border-t px-6 py-3">
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

      <CardFooter className="justify-end border-t px-6 py-3">
        <Button type="button" disabled={isPending || !isDirty} onClick={handleSubmit}>
          {isPending ? <Spinner className="mr-2" /> : <Save className="mr-2 size-4" />}
          Lưu giải thưởng bổ sung
        </Button>
      </CardFooter>
    </Card>
  );
}
