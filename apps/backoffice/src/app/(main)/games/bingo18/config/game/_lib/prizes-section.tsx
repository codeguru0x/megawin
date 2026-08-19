"use client";

import { useMemo, useState } from "react";

import type {
  BigSmallDrawPrizes,
  DoubleMatchPrizes,
  SingleNumPrizes,
  SumTotalPrizes,
  TripleMatchPrizes,
} from "@megawin/game-bingo18/entities";
import {
  analyzeBigSmallDrawProfitability,
  analyzeDoubleMatchProfitability,
  analyzeSingleNumProfitability,
  analyzeSumTotalProfitability,
  analyzeTripleMatchProfitability,
  type PlayTypeProfitSummary,
  type TierProfitAnalysis,
  TOTAL_OUTCOMES,
} from "@megawin/game-bingo18/rules";
import { MoneyInput } from "@megawin/ui/components/money-input";
import {
  ChevronDown,
  ChevronUp,
  Dice1,
  Dice2,
  Dice3,
  Dice5,
  Hash,
  Info,
  Save,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAiFormDirty } from "@/hooks/use-ai-form-dirty";
import { cn } from "@/lib/utils";

import type { Bingo18GameConfig } from "./use-game-config";

const fmt = (n: number) => n.toLocaleString("en-US");

interface PrizesSectionProps {
  config: Bingo18GameConfig;
  onSave: (data: Record<string, unknown>) => void;
  isPending: boolean;
}

// ─────────────────────────────────────────────
// Prize Group Definitions
// ─────────────────────────────────────────────

interface PrizeEntry {
  key: string;
  label: string;
  desc: string;
}

interface PrizeGroupDef {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  badgeColor: string;
  entries: PrizeEntry[];
  /**
   * true = tất cả entries là kết quả loại trừ lẫn nhau của cùng 1 cược
   *        → biên tổng (sum of all tier EP) có ý nghĩa.
   * false = mỗi entry là 1 cược riêng biệt
   *         → biên nên hiển thị "thấp nhất ~ cao nhất" (per-tier).
   */
  isSingleBet: boolean;
}

const PRIZE_GROUPS: PrizeGroupDef[] = [
  {
    id: "singleNum",
    label: "Một số",
    description: "Đoán đúng 1 trong 3 xúc xắc · 3 mức thưởng",
    icon: <Dice1 className="size-3.5 text-white" />,
    badgeColor: "bg-blue-500",
    isSingleBet: true,
    entries: [
      { key: "match1", label: "Trùng 1/3", desc: "số chọn xuất hiện 1 lần" },
      { key: "match2", label: "Trùng 2/3", desc: "số chọn xuất hiện 2 lần" },
      { key: "match3", label: "Trùng 3/3", desc: "số chọn xuất hiện 3 lần" },
    ],
  },
  {
    id: "doubleMatch",
    label: "Hai số trùng",
    description: "Số đã chọn xuất hiện ≥ 2 trong 3 xúc xắc · 1 mức thưởng",
    icon: <Dice2 className="size-3.5 text-white" />,
    badgeColor: "bg-purple-500",
    isSingleBet: true,
    entries: [{ key: "win", label: "Trùng ≥2/3", desc: "số đã chọn xuất hiện 2 hoặc 3 lần" }],
  },
  {
    id: "tripleMatch",
    label: "Ba số trùng",
    description: "Cả 3 xúc xắc cùng giá trị — 2 cửa cược độc lập (Cụ thể / Bất kỳ)",
    icon: <Dice3 className="size-3.5 text-white" />,
    badgeColor: "bg-red-500",
    isSingleBet: false,
    entries: [
      { key: "specific", label: "Cụ thể", desc: "3 số đều trùng số đã chọn (1/216 = 0,46%)" },
      { key: "any", label: "Bất kỳ", desc: "3 số giống nhau, bất kể số nào (6/216 = 2,78%)" },
    ],
  },
  {
    id: "sumTotal",
    label: "Cộng tổng",
    description: "Đoán tổng 3 xúc xắc (3–18) · 16 mức thưởng",
    icon: <Hash className="size-3.5 text-white" />,
    badgeColor: "bg-emerald-500",
    isSingleBet: false,
    entries: Array.from({ length: 16 }, (_, i) => {
      const sum = i + 3;
      return {
        key: String(sum),
        label: `Tổng ${sum}`,
        desc: `tổng 3 xúc xắc = ${sum}`,
      };
    }),
  },
  {
    id: "bigSmallDraw",
    label: "Lớn / Hoà / Nhỏ",
    description: "3 cửa cược độc lập — Lớn (≥12), Hoà (10–11), Nhỏ (≤9) · phủ kín 100% kết quả",
    icon: <Dice5 className="size-3.5 text-white" />,
    badgeColor: "bg-amber-500",
    isSingleBet: false,
    entries: [
      { key: "big", label: "Lớn", desc: "tổng ≥ 12 (81/216 = 37,5%)" },
      { key: "small", label: "Nhỏ", desc: "tổng ≤ 9 (81/216 = 37,5%)" },
      { key: "draw", label: "Hoà", desc: "tổng 10 hoặc 11 (54/216 = 25%)" },
    ],
  },
];

// ─────────────────────────────────────────────
// Read prizes from config by group id
// ─────────────────────────────────────────────

type PrizesState = {
  singleNumPrizes: SingleNumPrizes;
  doubleMatchPrizes: DoubleMatchPrizes;
  tripleMatchPrizes: TripleMatchPrizes;
  sumTotalPrizes: SumTotalPrizes;
  bigSmallDrawPrizes: BigSmallDrawPrizes;
};

const CONFIG_KEY_MAP: Record<string, keyof PrizesState> = {
  singleNum: "singleNumPrizes",
  doubleMatch: "doubleMatchPrizes",
  tripleMatch: "tripleMatchPrizes",
  sumTotal: "sumTotalPrizes",
  bigSmallDraw: "bigSmallDrawPrizes",
};

function getPrizesRecord(state: PrizesState, groupId: string): Record<string, number> {
  const configKey = CONFIG_KEY_MAP[groupId];
  if (!configKey) return {};
  const data = state[configKey];
  if (!data) return {};
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(data)) {
    result[k] = typeof v === "number" ? v : 0;
  }
  return result;
}

// ─────────────────────────────────────────────
// Analyzers
// ─────────────────────────────────────────────

function analyzeGroup(
  groupId: string,
  prizes: Record<string, number>,
  unitPrice: number,
): PlayTypeProfitSummary | undefined {
  switch (groupId) {
    case "singleNum":
      return analyzeSingleNumProfitability(
        {
          match1: prizes.match1 ?? 0,
          match2: prizes.match2 ?? 0,
          match3: prizes.match3 ?? 0,
        },
        unitPrice,
      );
    case "doubleMatch":
      return analyzeDoubleMatchProfitability({ win: prizes.win ?? 0 }, unitPrice);
    case "tripleMatch": {
      const result = analyzeTripleMatchProfitability(
        { specific: prizes.specific ?? 0, any: prizes.any ?? 0 },
        unitPrice,
      );
      const allTiers = [...result.specific.tiers, ...result.any.tiers];
      const totalExpectedPayout = allTiers.reduce((s, t) => s + t.expectedPayout, 0);
      const totalPayoutRatio = unitPrice > 0 ? totalExpectedPayout / unitPrice : 0;
      return {
        playType: "tripleMatch",
        unitPrice,
        tiers: allTiers,
        totalExpectedPayout,
        totalPayoutRatio,
        grossMarginPerTicket: unitPrice - totalExpectedPayout,
        grossMarginPercent: unitPrice > 0 ? ((unitPrice - totalExpectedPayout) / unitPrice) * 100 : 0,
      };
    }
    case "sumTotal": {
      return analyzeSumTotalProfitability(prizes, unitPrice);
    }
    case "bigSmallDraw":
      return analyzeBigSmallDrawProfitability(
        {
          big: prizes.big ?? 0,
          small: prizes.small ?? 0,
          draw: prizes.draw ?? 0,
        },
        unitPrice,
      );
    default:
      return undefined;
  }
}

function findTierForEntry(
  groupId: string,
  entryKey: string,
  tiers: TierProfitAnalysis[],
): TierProfitAnalysis | undefined {
  switch (groupId) {
    case "singleNum": {
      const match = entryKey === "match1" ? "1/3" : entryKey === "match2" ? "2/3" : "3/3";
      return tiers.find((t) => t.label.includes(match));
    }
    case "doubleMatch":
      return tiers[0];
    case "tripleMatch":
      return entryKey === "any"
        ? tiers.find((t) => t.label.includes("bất kỳ"))
        : tiers.find((t) => t.label.includes("cụ thể"));
    case "sumTotal":
      return tiers.find((t) => t.label === `Tổng ${entryKey}`);
    case "bigSmallDraw": {
      const labelMap: Record<string, string> = {
        big: "Lớn",
        small: "Nhỏ",
        draw: "Hòa",
      };
      return tiers.find((t) => t.label.includes(labelMap[entryKey] ?? ""));
    }
    default:
      return undefined;
  }
}

// ─────────────────────────────────────────────
// UI Components
// ─────────────────────────────────────────────

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

function PrizeGroup({
  group,
  prizes,
  unitPrice,
  onChange,
  defaultOpen,
}: {
  group: PrizeGroupDef;
  prizes: Record<string, number>;
  unitPrice: number;
  onChange: (groupId: string, entryKey: string, value: number) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  const profitAnalysis = useMemo(() => analyzeGroup(group.id, prizes, unitPrice), [group.id, prizes, unitPrice]);

  const tierMargins = useMemo(() => {
    if (!profitAnalysis) return [];
    return profitAnalysis.tiers.map((t) => (1 - t.payoutRatio) * 100);
  }, [profitAnalysis]);

  const worstMargin = tierMargins.length > 0 ? Math.min(...tierMargins) : 0;
  const bestMargin = tierMargins.length > 0 ? Math.max(...tierMargins) : 0;

  const displayMargin = group.isSingleBet ? (profitAnalysis?.grossMarginPercent ?? 0) : worstMargin;

  const marginColor = displayMargin >= 50 ? "text-emerald-600" : displayMargin >= 0 ? "text-amber-600" : "text-red-600";

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
            <Badge className={cn("text-white text-xs", group.badgeColor)}>
              {group.icon}
              <span className="ml-1">{group.label}</span>
            </Badge>
            <span className="text-sm text-muted-foreground">{group.description}</span>
          </div>
          <div className="flex items-center gap-3">
            {profitAnalysis && (
              <span className={cn("text-xs tabular-nums font-semibold", marginColor)}>
                {displayMargin >= 0 ? (
                  <TrendingUp className="mr-0.5 inline size-3" />
                ) : (
                  <TrendingDown className="mr-0.5 inline size-3" />
                )}
                {group.isSingleBet
                  ? `Biên: ${displayMargin.toFixed(1)}%`
                  : `Biên thấp nhất: ${worstMargin.toFixed(1)}%`}
              </span>
            )}
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
          <div className="grid grid-cols-[2fr_160px_100px_120px_100px_120px] items-center gap-2 bg-muted/40 px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>Mức trúng</span>
            <span className="text-right">Giá trị thưởng</span>
            <HeaderTooltip
              label="Xác suất"
              tip="1 in N: cứ N vé bán ra thì kỳ vọng 1 vé trúng. Không gian mẫu: 6³ = 216."
              className="justify-end"
            />
            <HeaderTooltip
              label="CP kỳ vọng"
              tip="Chi phí trả thưởng kỳ vọng = xác suất × giải thưởng."
              className="justify-end"
            />
            <HeaderTooltip
              label="Tỷ lệ TT"
              tip="Tỷ lệ trả thưởng = CP kỳ vọng ÷ Giá 1 line × 100%. Trên 100% = LỖ."
              className="justify-end"
            />
            <HeaderTooltip label="Hoà vốn" tip="Giá trị giải thưởng tối đa để không lỗ." className="justify-end" />
          </div>
          {group.entries.map((entry) => {
            const tier = profitAnalysis ? findTierForEntry(group.id, entry.key, profitAnalysis.tiers) : undefined;
            const isOverBreakEven = tier && tier.currentPrize > tier.breakEvenPrize;

            return (
              <div
                key={entry.key}
                className={cn(
                  "grid grid-cols-[2fr_160px_100px_120px_100px_120px] items-center gap-2 rounded-md px-2 py-1.5",
                  isOverBreakEven && "bg-red-50 dark:bg-red-950/20",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{entry.label}</span>
                  <span className="text-xs text-muted-foreground">{entry.desc}</span>
                </div>
                <MoneyInput
                  className="h-8 w-40 text-right tabular-nums text-sm font-semibold"
                  value={prizes[entry.key] ?? 0}
                  onValueChange={(v) => onChange(group.id, entry.key, v ?? 0)}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-right text-xs tabular-nums text-muted-foreground cursor-help">
                      {tier ? `1 : ${fmt(Math.round(tier.oneInN))}` : "–"}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-72 text-xs">
                    {tier && (
                      <>
                        Số cách trúng: {fmt(Math.round(tier.probability * TOTAL_OUTCOMES))} / {TOTAL_OUTCOMES}
                        <br />
                        Xác suất: {(tier.probability * 100).toFixed(4)}%
                      </>
                    )}
                  </TooltipContent>
                </Tooltip>
                <span className="text-right text-xs tabular-nums font-medium">
                  {tier ? `${fmt(Math.round(tier.expectedPayout))}` : "–"}
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
                  {tier ? `${fmt(Math.round(tier.breakEvenPrize))}` : "–"}
                </span>
              </div>
            );
          })}
          {profitAnalysis && (
            <div className="flex items-center justify-between px-2 py-2 border-t mt-1">
              <span className="text-xs font-medium text-muted-foreground">
                Tổng {group.label}
                {!group.isSingleBet && profitAnalysis.tiers.filter((t) => t.payoutRatio > 1).length > 0
                  ? ` · ${profitAnalysis.tiers.filter((t) => t.payoutRatio > 1).length} mức vượt hoà vốn`
                  : !group.isSingleBet
                    ? " · Tất cả an toàn"
                    : ""}
              </span>
              <div className="flex items-center gap-4 text-xs">
                {group.isSingleBet && (
                  <span className="tabular-nums">
                    CP kỳ vọng: {fmt(Math.round(profitAnalysis.totalExpectedPayout))} VND
                  </span>
                )}
                <span className={cn("font-bold tabular-nums", marginColor)}>
                  {displayMargin >= 0 ? (
                    <TrendingUp className="mr-1 inline size-3" />
                  ) : (
                    <TrendingDown className="mr-1 inline size-3" />
                  )}
                  {group.isSingleBet
                    ? `${profitAnalysis.grossMarginPercent.toFixed(2)}%`
                    : `Biên: ${worstMargin.toFixed(1)}% ~ ${bestMargin.toFixed(1)}%`}
                </span>
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─────────────────────────────────────────────
// Main Section
// ─────────────────────────────────────────────

export function PrizesSection({ config, onSave, isPending }: PrizesSectionProps) {
  const [localPrizes, setLocalPrizes] = useState<PrizesState>(() => ({
    singleNumPrizes: { ...config.singleNumPrizes },
    doubleMatchPrizes: { ...config.doubleMatchPrizes },
    tripleMatchPrizes: { ...config.tripleMatchPrizes },
    sumTotalPrizes: { ...config.sumTotalPrizes },
    bigSmallDrawPrizes: { ...config.bigSmallDrawPrizes },
  }));
  const [isDirty, setIsDirty] = useState(false);

  useAiFormDirty("prizes", isDirty);

  const unitPrice = config.play.unitPrice;

  const allSummaries = useMemo(() => {
    return PRIZE_GROUPS.map((group) => {
      const prizes = getPrizesRecord(localPrizes, group.id);
      const analysis = analyzeGroup(group.id, prizes, unitPrice);
      return analysis ? { key: group.id, isSingleBet: group.isSingleBet, ...analysis } : null;
    }).filter(Boolean) as Array<PlayTypeProfitSummary & { key: string; isSingleBet: boolean }>;
  }, [localPrizes, unitPrice]);

  const worstMarginOverall = useMemo(() => {
    let worst = Infinity;
    for (const s of allSummaries) {
      if (s.isSingleBet) {
        worst = Math.min(worst, s.grossMarginPercent);
      } else {
        for (const t of s.tiers) {
          worst = Math.min(worst, (1 - t.payoutRatio) * 100);
        }
      }
    }
    return worst === Infinity ? 0 : worst;
  }, [allSummaries]);

  function handleChange(groupId: string, entryKey: string, value: number) {
    const configKey = CONFIG_KEY_MAP[groupId];
    if (!configKey) return;
    setLocalPrizes((prev) => ({
      ...prev,
      [configKey]: { ...prev[configKey], [entryKey]: value },
    }));
    setIsDirty(true);
  }

  function handleSubmit() {
    onSave({
      singleNumPrizes: localPrizes.singleNumPrizes,
      doubleMatchPrizes: localPrizes.doubleMatchPrizes,
      tripleMatchPrizes: localPrizes.tripleMatchPrizes,
      sumTotalPrizes: localPrizes.sumTotalPrizes,
      bigSmallDrawPrizes: localPrizes.bigSmallDrawPrizes,
    });
    setIsDirty(false);
  }

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <CardContent className="p-0">
        <div className="p-6 pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Giải thưởng Bingo 18</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cấu hình giá trị thưởng cho 5 loại cược: Một số, Hai số trùng, Ba số trùng, Cộng tổng, Lớn/Hoà/Nhỏ
                {" · "}Mệnh giá: <strong>{fmt(unitPrice)} VND</strong>
                {" · "}Không gian mẫu: <strong>{TOTAL_OUTCOMES}</strong> (6³)
              </p>
            </div>
            <div className="text-right text-xs shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="cursor-help">
                    <span className="text-muted-foreground flex items-center justify-end gap-1">
                      Biên LN thấp nhất
                      <Info className="size-3 text-muted-foreground/60" />
                    </span>
                    <div
                      className={cn(
                        "font-bold tabular-nums",
                        worstMarginOverall >= 50
                          ? "text-emerald-600"
                          : worstMarginOverall >= 0
                            ? "text-amber-600"
                            : "text-red-600",
                      )}
                    >
                      {worstMarginOverall >= 0 ? (
                        <TrendingUp className="mr-1 inline size-3.5" />
                      ) : (
                        <TrendingDown className="mr-1 inline size-3.5" />
                      )}
                      {worstMarginOverall.toFixed(2)}%
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-72 text-xs">
                  Biên lợi nhuận thấp nhất trong tất cả mức cược. Mỗi loại cược là độc lập — khách chỉ đặt 1 mức mỗi
                  lần, nên con số này phản ánh trường hợp xấu nhất.
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        <div className="border-t px-6 py-3 space-y-2">
          {PRIZE_GROUPS.map((group, i) => (
            <PrizeGroup
              key={group.id}
              group={group}
              prizes={getPrizesRecord(localPrizes, group.id)}
              unitPrice={unitPrice}
              onChange={handleChange}
              defaultOpen={i < 2}
            />
          ))}
        </div>
      </CardContent>

      <CardFooter className="justify-end border-t px-6 py-3">
        <Button type="button" disabled={isPending || !isDirty} onClick={handleSubmit}>
          {isPending ? <Spinner className="mr-2" /> : <Save className="mr-2 size-4" />}
          Lưu giải thưởng Bingo 18
        </Button>
      </CardFooter>
    </Card>
  );
}
