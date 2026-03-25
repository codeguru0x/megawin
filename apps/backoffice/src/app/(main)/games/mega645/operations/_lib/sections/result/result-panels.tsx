"use client";

/**
 * Mega 6/45 — Kết quả & Phân bổ giải thưởng + Tài chính kỳ
 *
 * Mega 6/45 khác Lotto 5/35:
 * - Không có winningSpecial (chỉ 6 số chính)
 * - 4 tiers: jackpot, tier1 (5/6), tier2 (4/6), tier3 (3/6)
 * - Dùng MegaNumberBall (màu teal/emerald)
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MegaNumberBall } from "@/components/games/mega645/mega-number-ball";
import { Badge } from "@/components/ui/badge";
import { PrizeTier } from "@megawin/game-mega645/entities";
import { formatNumber } from "@megawin/shared/utils";
import {
  Trophy,
  TrendingDown,
  Users,
  Coins,
  ArrowDownRight,
  Gem,
  TrendingUp,
  Star,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import type { DrawResult, DrawFinancialDisplay } from "../../types";
import { WinningEntriesDialog } from "./winning-entries-dialog";

// ─── Tier config — Mega 6/45 teal/emerald theme ──────────────────────────────

const TIER_CONFIG: Partial<
  Record<
    PrizeTier,
    {
      badge: string;
      row: string;
      icon?: React.ElementType;
    }
  >
> = {
  [PrizeTier.Jackpot]: {
    badge:
      "border-teal-300 bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-700",
    row: "bg-teal-50/60 dark:bg-teal-950/10 border-l-2 border-l-teal-400",
    icon: Gem,
  },
  [PrizeTier.Tier1]: {
    badge:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-700",
    row: "bg-emerald-50/40 dark:bg-emerald-950/5",
    icon: Trophy,
  },
  [PrizeTier.Tier2]: {
    badge:
      "border-cyan-300 bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300 dark:border-cyan-700",
    row: "bg-cyan-50/30 dark:bg-cyan-950/5",
  },
  [PrizeTier.Tier3]: {
    badge:
      "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-700",
    row: "",
  },
};

// ─── Jackpot Winner Banner ────────────────────────────────────────────────────

function JackpotWinnerBanner({
  winnerCount,
  totalPrize,
}: {
  winnerCount: number;
  totalPrize: number;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border-2 border-teal-400/60 dark:border-teal-500/50">
      <div className="absolute inset-0 bg-linear-to-br from-teal-50 via-emerald-50 to-cyan-50 dark:from-teal-950/40 dark:via-emerald-950/30 dark:to-cyan-950/40" />
      <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/40 to-transparent dark:via-white/10 -translate-x-full animate-[shimmer_2.5s_ease-in-out_infinite]" />

      <Sparkles className="absolute right-3 top-3 size-4 text-teal-400/60 dark:text-teal-500/60 animate-pulse" />
      <Sparkles className="absolute left-3 bottom-3 size-3 text-emerald-300/50 dark:text-emerald-600/50 animate-pulse [animation-delay:0.8s]" />

      <div className="relative flex items-center gap-4 px-5 py-4">
        <div className="flex size-12 items-center justify-center rounded-full bg-teal-400/20 dark:bg-teal-500/20 ring-2 ring-teal-400/40 dark:ring-teal-500/30 shrink-0">
          <Gem className="size-6 text-teal-500 dark:text-teal-400 drop-shadow-sm" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-teal-800 dark:text-teal-300 tracking-tight">
              🎉 ĐỘC ĐẮC — CÓ NGƯỜI TRÚNG!
            </p>
            <Badge className="bg-teal-500/20 text-teal-700 dark:text-teal-300 border border-teal-400/50 text-[10px] px-2 h-4.5 gap-1">
              <Star className="size-2.5 fill-current" />
              {winnerCount} line trúng
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-teal-700/80 dark:text-teal-400/80">
            Tổng giải Jackpot đã trao:{" "}
            <span className="font-bold text-teal-700 dark:text-teal-300 tabular-nums text-sm">
              {formatNumber(totalPrize)}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Jackpot Row (special full-width treatment) ──────────────────────────────

function JackpotWinnerRow({ t }: { t: DrawResult["tiers"][number] }) {
  return (
    <div className="relative overflow-hidden border-b border-teal-200/70 dark:border-teal-800/50">
      <div className="absolute inset-0 bg-linear-to-r from-teal-50/80 via-emerald-50/60 to-teal-50/30 dark:from-teal-950/30 dark:via-emerald-950/20 dark:to-transparent" />
      <div className="relative grid grid-cols-[1fr_5rem_7rem_7rem] gap-x-2 px-3 py-3 items-center">
        <div className="flex items-center gap-2">
          <Gem className="size-3.5 text-teal-500 shrink-0 animate-pulse" />
          <Badge
            variant="outline"
            className="border-teal-300 bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-700 text-[11px] px-2 py-0 h-5 gap-1"
          >
            <Star className="size-2.5 fill-teal-500 text-teal-500" />
            {t.label}
          </Badge>
        </div>
        <span className="text-right tabular-nums text-sm font-bold text-teal-600 dark:text-teal-400">
          {formatNumber(t.winnerCount)}
        </span>
        <span className="text-right tabular-nums text-sm text-teal-600/70 dark:text-teal-400/70">
          {t.prizeAmount > 0 ? formatNumber(t.prizeAmount) : "—"}
        </span>
        <span className="text-right tabular-nums text-sm font-bold text-teal-600 dark:text-teal-400">
          {t.totalPrize > 0 ? formatNumber(t.totalPrize) : "—"}
        </span>
      </div>
    </div>
  );
}

// ─── Result + Prize Breakdown ─────────────────────────────────────────────────

export function ResultAndPrize({ result, drawId }: { result: DrawResult; drawId: string }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const totalPrize = result.tiers.reduce((a, t) => a + t.totalPrize, 0);
  const totalWinningLines = result.tiers.reduce((a, t) => a + t.winnerCount, 0);

  const jackpotTier = result.tiers.find((t) => t.tier === PrizeTier.Jackpot);
  const hasJackpotWinner = (jackpotTier?.winnerCount ?? 0) > 0;

  return (
    <>
      <Card
        className={cn(
          "shadow-sm",
          hasJackpotWinner && "ring-1 ring-teal-400/40 dark:ring-teal-500/30",
        )}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex size-7 items-center justify-center rounded-lg shrink-0",
                hasJackpotWinner
                  ? "bg-teal-200 dark:bg-teal-800/60"
                  : "bg-teal-100 dark:bg-teal-900/50",
              )}
            >
              {hasJackpotWinner ? (
                <Gem className="size-3.5 text-teal-600 dark:text-teal-400" />
              ) : (
                <Trophy className="size-3.5 text-teal-600 dark:text-teal-400" />
              )}
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Kết quả & Phân bổ giải thưởng</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                <span className="font-semibold text-foreground tabular-nums">
                  {formatNumber(totalWinningLines)}
                </span>{" "}
                line trúng thưởng · Tổng giải{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {formatNumber(totalPrize)}
                </span>
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {hasJackpotWinner && jackpotTier && (
            <JackpotWinnerBanner
              winnerCount={jackpotTier.winnerCount}
              totalPrize={jackpotTier.totalPrize}
            />
          )}

          {/* Winning numbers — Mega 6/45: 6 số chính, không có specialNumber */}
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className={cn(
              "group w-full flex flex-col items-center gap-3 rounded-xl border px-4 py-4",
              "transition-all duration-150 cursor-pointer",
              "hover:shadow-sm hover:border-primary/30 hover:bg-muted/30",
              hasJackpotWinner
                ? "bg-teal-50/40 border-teal-200/60 dark:bg-teal-950/10 dark:border-teal-800/40"
                : "bg-muted/20",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Kết quả
              </span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60 group-hover:text-primary/60 transition-colors">
                <ExternalLink className="size-3" />
                Xem entries trúng
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {result.winningNumbers.map((n) => (
                <MegaNumberBall key={n} number={Number(n)} size="md" />
              ))}
            </div>
          </button>

          {/* Prize table */}
          <div className="rounded-xl border overflow-hidden">
            <div className="grid grid-cols-[1fr_5rem_7rem_7rem] gap-x-2 px-3 py-2 bg-muted/40 border-b">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Hạng giải
              </span>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">
                Lines
              </span>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">
                Tiền/line
              </span>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">
                Tổng giải
              </span>
            </div>

            {result.tiers.map((t, idx) => {
              const cfg = TIER_CONFIG[t.tier];
              const hasWinner = t.winnerCount > 0;
              const isJackpot = t.tier === PrizeTier.Jackpot;

              if (isJackpot && hasWinner) {
                return <JackpotWinnerRow key={t.tier} t={t} />;
              }

              const IconComp = cfg?.icon;

              return (
                <div
                  key={t.tier}
                  className={cn(
                    "grid grid-cols-[1fr_5rem_7rem_7rem] gap-x-2 px-3 py-2.5 items-center",
                    idx < result.tiers.length - 1 && "border-b border-border/50",
                    hasWinner ? cfg?.row : "",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {IconComp ? (
                      <IconComp
                        className={cn(
                          "size-3.5 shrink-0",
                          t.tier === PrizeTier.Jackpot && "text-teal-500",
                          t.tier === PrizeTier.Tier1 && "text-emerald-500",
                        )}
                      />
                    ) : (
                      <span className="size-3.5 shrink-0" />
                    )}
                    <Badge
                      variant="outline"
                      className={cn("text-[11px] border px-2 py-0 h-5", cfg?.badge)}
                    >
                      {t.label}
                    </Badge>
                  </div>

                  <span
                    className={cn(
                      "text-right tabular-nums text-sm font-semibold",
                      hasWinner
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-muted-foreground/30",
                    )}
                  >
                    {hasWinner ? formatNumber(t.winnerCount) : "—"}
                  </span>

                  <span
                    className={cn(
                      "text-right tabular-nums text-sm",
                      hasWinner ? "text-muted-foreground" : "text-muted-foreground/30",
                    )}
                  >
                    {t.prizeAmount > 0 && hasWinner ? formatNumber(t.prizeAmount) : "—"}
                  </span>

                  <span
                    className={cn(
                      "text-right tabular-nums text-sm font-bold",
                      t.totalPrize > 0 ? "text-foreground" : "text-muted-foreground/30",
                    )}
                  >
                    {t.totalPrize > 0 ? formatNumber(t.totalPrize) : "—"}
                  </span>
                </div>
              );
            })}

            <div className="grid grid-cols-[1fr_5rem_7rem_7rem] gap-x-2 px-3 py-2.5 items-center border-t bg-muted/20">
              <span className="text-xs font-semibold text-muted-foreground">Tổng</span>
              <span className="text-right tabular-nums text-sm font-bold text-foreground">
                {formatNumber(totalWinningLines)}
              </span>
              <span />
              <span className="text-right tabular-nums text-sm font-bold text-foreground">
                {formatNumber(totalPrize)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <WinningEntriesDialog drawId={drawId} open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

// ─── Financial Summary ────────────────────────────────────────────────────────

interface LedgerRow {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  value: number;
  sign: "+" | "-" | "=";
  valueColor: string;
  bold?: boolean;
  indent?: boolean;
  separator?: boolean;
}

function AccountRow({ row }: { row: LedgerRow }) {
  const Icon = row.icon;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 py-2",
        row.separator && "border-t border-border/60 mt-1 pt-3",
        row.indent && "pl-5",
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div
          className={cn("flex size-6 items-center justify-center rounded-md shrink-0", row.iconBg)}
        >
          <Icon className={cn("size-3.5", row.iconColor)} />
        </div>
        <span
          className={cn(
            "text-sm",
            row.bold ? "font-semibold text-foreground" : "text-muted-foreground",
          )}
        >
          {row.label}
        </span>
      </div>
      <span
        className={cn(
          "tabular-nums text-sm font-mono shrink-0",
          row.bold ? "font-bold" : "",
          row.valueColor,
        )}
      >
        {row.sign !== "=" ? row.sign : ""}
        {formatNumber(row.value)}
      </span>
    </div>
  );
}

export function FinancialSummary({ financial: f }: { financial: DrawFinancialDisplay }) {
  const netAfterPrizes = f.totalRevenue - f.totalAgentCommission - f.totalFixedPrizes;
  const netAfterCompany = netAfterPrizes - f.companyTake;

  const rows: LedgerRow[] = [
    {
      icon: TrendingUp,
      iconBg: "bg-emerald-100 dark:bg-emerald-900/50",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      label: "Doanh thu gộp",
      value: f.totalRevenue,
      sign: "+",
      valueColor: "text-emerald-700 dark:text-emerald-400",
      bold: true,
    },
    {
      icon: Users,
      iconBg: "bg-slate-100 dark:bg-slate-800",
      iconColor: "text-slate-500 dark:text-slate-400",
      label: "Hoa hồng đại lý",
      value: f.totalAgentCommission,
      sign: "-",
      valueColor: "text-destructive",
      indent: true,
    },
    {
      icon: Trophy,
      iconBg: "bg-teal-100 dark:bg-teal-900/50",
      iconColor: "text-teal-600 dark:text-teal-400",
      label: "Chi trả giải thưởng",
      value: f.totalFixedPrizes,
      sign: "-",
      valueColor: "text-destructive",
      indent: true,
    },
    ...(f.companyTake > 0
      ? [
          {
            icon: Coins,
            iconBg: "bg-slate-100 dark:bg-slate-800",
            iconColor: "text-slate-500 dark:text-slate-400",
            label: "Công ty thu",
            value: f.companyTake,
            sign: "-" as const,
            valueColor: "text-destructive",
            indent: true,
          },
        ]
      : []),
    {
      icon: ArrowDownRight,
      iconBg: "bg-blue-100 dark:bg-blue-900/50",
      iconColor: "text-blue-600 dark:text-blue-400",
      label: "Thu thuần (trước Jackpot)",
      value: netAfterCompany,
      sign: "=",
      valueColor: netAfterCompany >= 0 ? "text-blue-700 dark:text-blue-400" : "text-destructive",
      bold: true,
      separator: true,
    },
    {
      icon: TrendingDown,
      iconBg: "bg-teal-100 dark:bg-teal-900/50",
      iconColor: "text-teal-600 dark:text-teal-400",
      label: "Đóng góp Jackpot",
      value: f.jackpotContribution,
      sign: "+",
      valueColor: "text-teal-700 dark:text-teal-400",
      indent: true,
    },
  ];

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50 shrink-0">
            <Coins className="size-3.5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Tài chính kỳ</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Phân bổ doanh thu sau kết sổ
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-0 pt-0">
        <div className="divide-y-0">
          {rows.map((row) => (
            <AccountRow key={row.label} row={row} />
          ))}
        </div>

        {/* Biến động Jackpot pool — Mega 6/45 chỉ có 1 jackpot */}
        <div className="mt-2 rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-muted/30">
            <Gem className="size-3.5 text-teal-500 shrink-0" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Biến động Jackpot
            </span>
          </div>
          <div className="divide-y divide-border/40">
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-sm text-muted-foreground pl-8">Trước kỳ</span>
              <span className="tabular-nums text-sm font-mono text-muted-foreground shrink-0">
                {formatNumber(f.jackpotBefore)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-sm text-teal-700 dark:text-teal-400 pl-8">+ Đóng góp</span>
              <span className="tabular-nums text-sm font-mono font-semibold text-teal-700 dark:text-teal-400 shrink-0">
                +{formatNumber(f.jackpotContribution)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2 bg-muted/20">
              <span className="text-sm font-bold text-foreground pl-8">Sau kỳ</span>
              <span className="tabular-nums text-sm font-mono font-bold text-teal-600 dark:text-teal-400 shrink-0">
                {formatNumber(f.jackpotAfter)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
