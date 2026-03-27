"use client";

/**
 * Power 6/55 — Kết quả & Phân bổ giải thưởng + Tài chính kỳ
 *
 * Power 6/55 khác Mega 6/45:
 * - Có bonusNumber (số thưởng)
 * - 6 tiers: jackpot1, jackpot2, tier1-4
 * - Jackpot kép: JP1 pool + JP2 pool riêng
 * - Dùng PowerNumberBall (màu purple/indigo)
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PowerNumberBall } from "@/components/games/power655/power-number-ball";
import { Badge } from "@/components/ui/badge";
import { PrizeTier } from "@megawin/game-power655/entities";
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
  Zap,
} from "lucide-react";
import type { DrawResult, DrawFinancialDisplay } from "../../types";
import { WinningEntriesDialog } from "./winning-entries-dialog";

// ─── Tier config — Power 6/55 purple theme ───────────────────────────────────

const TIER_CONFIG: Partial<
  Record<PrizeTier, { badge: string; row: string; icon?: React.ElementType }>
> = {
  [PrizeTier.Jackpot1]: {
    badge:
      "border-purple-300 bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-700",
    row: "bg-purple-50/60 dark:bg-purple-950/10 border-l-2 border-l-purple-400",
    icon: Gem,
  },
  [PrizeTier.Jackpot2]: {
    badge:
      "border-indigo-300 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-700",
    row: "bg-indigo-50/40 dark:bg-indigo-950/10 border-l-2 border-l-indigo-400",
    icon: Zap,
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

function JackpotWinnerBanner({
  winnerCount,
  totalPrize,
  tier,
}: {
  winnerCount: number;
  totalPrize: number;
  tier: "jp1" | "jp2";
}) {
  const isJp1 = tier === "jp1";
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border-2",
        isJp1
          ? "border-purple-400/60 dark:border-purple-500/50"
          : "border-indigo-400/60 dark:border-indigo-500/50",
      )}
    >
      <div
        className={cn(
          "absolute inset-0 bg-linear-to-br",
          isJp1
            ? "from-purple-50 via-violet-50 to-indigo-50 dark:from-purple-950/40 dark:via-violet-950/30 dark:to-indigo-950/40"
            : "from-indigo-50 via-blue-50 to-cyan-50 dark:from-indigo-950/40 dark:via-blue-950/30 dark:to-cyan-950/40",
        )}
      />

      <Sparkles
        className={cn(
          "absolute right-3 top-3 size-4 animate-pulse",
          isJp1 ? "text-purple-400/60" : "text-indigo-400/60",
        )}
      />

      <div className="relative flex items-center gap-4 px-5 py-4">
        <div
          className={cn(
            "flex size-12 items-center justify-center rounded-full ring-2 shrink-0",
            isJp1
              ? "bg-purple-400/20 dark:bg-purple-500/20 ring-purple-400/40 dark:ring-purple-500/30"
              : "bg-indigo-400/20 dark:bg-indigo-500/20 ring-indigo-400/40 dark:ring-indigo-500/30",
          )}
        >
          {isJp1 ? (
            <Gem className={cn("size-6 drop-shadow-sm", "text-purple-500 dark:text-purple-400")} />
          ) : (
            <Zap className={cn("size-6 drop-shadow-sm", "text-indigo-500 dark:text-indigo-400")} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p
              className={cn(
                "text-sm font-bold tracking-tight",
                isJp1
                  ? "text-purple-800 dark:text-purple-300"
                  : "text-indigo-800 dark:text-indigo-300",
              )}
            >
              🎉 {isJp1 ? "JACKPOT 1" : "JACKPOT 2"} — CÓ NGƯỜI TRÚNG!
            </p>
            <Badge
              className={cn(
                "text-xs px-2 h-4.5 gap-1 border",
                isJp1
                  ? "bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-400/50"
                  : "bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-400/50",
              )}
            >
              <Star className="size-2.5 fill-current" />
              {winnerCount} line trúng
            </Badge>
          </div>
          <p
            className={cn(
              "mt-0.5 text-xs",
              isJp1
                ? "text-purple-700/80 dark:text-purple-400/80"
                : "text-indigo-700/80 dark:text-indigo-400/80",
            )}
          >
            Tổng giải đã trao:{" "}
            <span
              className={cn(
                "font-bold tabular-nums text-sm",
                isJp1
                  ? "text-purple-700 dark:text-purple-300"
                  : "text-indigo-700 dark:text-indigo-300",
              )}
            >
              {formatNumber(totalPrize)}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

export function ResultAndPrize({ result, drawId }: { result: DrawResult; drawId: string }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const totalPrize = result.tiers.reduce((a, t) => a + t.totalPrize, 0);
  const totalWinningLines = result.tiers.reduce((a, t) => a + t.winnerCount, 0);

  const jp1Tier = result.tiers.find((t) => t.tier === PrizeTier.Jackpot1);
  const jp2Tier = result.tiers.find((t) => t.tier === PrizeTier.Jackpot2);
  const hasJp1Winner = (jp1Tier?.winnerCount ?? 0) > 0;
  const hasJp2Winner = (jp2Tier?.winnerCount ?? 0) > 0;

  return (
    <>
      <Card
        className={cn(
          "gap-0 py-0 shadow-sm",
          (hasJp1Winner || hasJp2Winner) && "ring-1 ring-purple-400/40 dark:ring-purple-500/30",
        )}
      >
        <CardHeader className="px-5 pb-2 pt-4">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex size-7 items-center justify-center rounded-lg shrink-0",
                hasJp1Winner
                  ? "bg-purple-200 dark:bg-purple-800/60"
                  : "bg-purple-100 dark:bg-purple-900/50",
              )}
            >
              {hasJp1Winner ? (
                <Gem className="size-3.5 text-purple-600 dark:text-purple-400" />
              ) : (
                <Trophy className="size-3.5 text-purple-600 dark:text-purple-400" />
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
        <CardContent className="px-5 pb-4 pt-0 space-y-4">
          {hasJp1Winner && jp1Tier && (
            <JackpotWinnerBanner
              winnerCount={jp1Tier.winnerCount}
              totalPrize={jp1Tier.totalPrize}
              tier="jp1"
            />
          )}
          {hasJp2Winner && jp2Tier && (
            <JackpotWinnerBanner
              winnerCount={jp2Tier.winnerCount}
              totalPrize={jp2Tier.totalPrize}
              tier="jp2"
            />
          )}

          {/* Winning numbers — Power 6/55: 6 số chính + 1 bonus number */}
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className={cn(
              "group w-full flex flex-col items-center gap-3 rounded-xl border px-4 py-4",
              "transition-all duration-150 cursor-pointer",
              "hover:shadow-sm hover:border-primary/30 hover:bg-muted/30",
              hasJp1Winner || hasJp2Winner
                ? "bg-purple-50/40 border-purple-200/60 dark:bg-purple-950/10 dark:border-purple-800/40"
                : "bg-muted/20",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Kết quả
              </span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground/60 group-hover:text-primary/60 transition-colors">
                <ExternalLink className="size-3" />
                Xem entries trúng
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {result.winningMain.map((n) => (
                <PowerNumberBall key={n} number={Number(n)} size="md" />
              ))}
              {result.bonusNumber && (
                <>
                  <span className="text-xs text-muted-foreground font-bold">+</span>
                  <PowerNumberBall number={Number(result.bonusNumber)} size="md" variant="bonus" />
                </>
              )}
            </div>
          </button>

          {/* Prize table */}
          <div className="rounded-xl border overflow-hidden">
            <div className="grid grid-cols-[1fr_5rem_7rem_7rem] gap-x-2 px-3 py-2 bg-muted/40 border-b">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Hạng giải
              </span>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
                Lines
              </span>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
                Tiền/line
              </span>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
                Tổng giải
              </span>
            </div>

            {result.tiers.map((t, idx) => {
              const cfg = TIER_CONFIG[t.tier];
              const hasWinner = t.winnerCount > 0;
              const isJpTier = t.tier === PrizeTier.Jackpot1 || t.tier === PrizeTier.Jackpot2;
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
                          t.tier === PrizeTier.Jackpot1 && "text-purple-500",
                          t.tier === PrizeTier.Jackpot2 && "text-indigo-500",
                          t.tier === PrizeTier.Tier1 && "text-emerald-500",
                        )}
                      />
                    ) : (
                      <span className="size-3.5 shrink-0" />
                    )}
                    <Badge
                      variant="outline"
                      className={cn("text-xs border px-2 py-0 h-5", cfg?.badge)}
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
                    {t.prizeAmount > 0 && hasWinner
                      ? formatNumber(t.prizeAmount)
                      : isJpTier
                        ? "chia pool"
                        : "—"}
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
  const totalJpContribution = f.jackpot1Contribution + f.jackpot2Contribution;

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
      iconBg: "bg-purple-100 dark:bg-purple-900/50",
      iconColor: "text-purple-600 dark:text-purple-400",
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
      iconBg: "bg-purple-100 dark:bg-purple-900/50",
      iconColor: "text-purple-600 dark:text-purple-400",
      label: "Đóng góp Jackpot (JP1+JP2)",
      value: totalJpContribution,
      sign: "+",
      valueColor: "text-purple-700 dark:text-purple-400",
      indent: true,
    },
  ];

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="px-5 pb-2 pt-4">
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

      <CardContent className="px-5 pb-4 pt-0 space-y-0">
        <div className="divide-y-0">
          {rows.map((row) => (
            <AccountRow key={row.label} row={row} />
          ))}
        </div>

        {/* Biến động Jackpot kép — JP1 + JP2 */}
        <div className="mt-2 rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-muted/30">
            <Gem className="size-3.5 text-purple-500 shrink-0" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Biến động Jackpot
            </span>
          </div>

          {/* JP1 */}
          <div className="divide-y divide-border/30">
            <div className="flex items-center justify-between gap-3 px-3 py-1.5">
              <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
                JP1 trước
              </span>
              <span className="tabular-nums text-xs font-mono text-muted-foreground">
                {formatNumber(f.jackpot1Before)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-1.5">
              <span className="text-xs text-purple-600/70 dark:text-purple-400/70 pl-3">
                + Đóng góp
              </span>
              <span className="tabular-nums text-xs font-mono font-semibold text-purple-600 dark:text-purple-400">
                +{formatNumber(f.jackpot1Contribution)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-1.5 bg-purple-50/30 dark:bg-purple-950/10">
              <span className="text-xs font-bold text-purple-700 dark:text-purple-300 pl-3">
                JP1 sau
              </span>
              <span className="tabular-nums text-xs font-mono font-bold text-purple-600 dark:text-purple-400">
                {formatNumber(f.jackpot1After)}
              </span>
            </div>

            {/* JP2 */}
            <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-t">
              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                JP2 trước
              </span>
              <span className="tabular-nums text-xs font-mono text-muted-foreground">
                {formatNumber(f.jackpot2Before)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-1.5">
              <span className="text-xs text-indigo-600/70 dark:text-indigo-400/70 pl-3">
                + Đóng góp
              </span>
              <span className="tabular-nums text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                +{formatNumber(f.jackpot2Contribution)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-1.5 bg-indigo-50/30 dark:bg-indigo-950/10">
              <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 pl-3">
                JP2 sau
              </span>
              <span className="tabular-nums text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {formatNumber(f.jackpot2After)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
