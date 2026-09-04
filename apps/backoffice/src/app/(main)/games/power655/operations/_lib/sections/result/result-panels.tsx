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

import { PrizeTier } from "@megawin/game-power655/entities";
import { formatNumber } from "@megawin/shared/utils";
import {
  ArrowDownRight,
  Coins,
  ExternalLink,
  Gem,
  Info,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from "lucide-react";

import { PowerNumberBall } from "@/components/games/power655/power-number-ball";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { DrawFinancialDisplay, DrawResult } from "../../types";
import { WinningEntriesDialog } from "./winning-entries-dialog";

// ─── Tier config — Power 6/55 purple theme ───────────────────────────────────

const TIER_CONFIG: Partial<Record<PrizeTier, { badge: string; row: string; icon?: React.ElementType }>> = {
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
    badge: "border-cyan-300 bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300 dark:border-cyan-700",
    row: "bg-cyan-50/30 dark:bg-cyan-950/5",
  },
  [PrizeTier.Tier3]: {
    badge: "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-700",
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
        isJp1 ? "border-purple-400/60 dark:border-purple-500/50" : "border-indigo-400/60 dark:border-indigo-500/50",
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
                isJp1 ? "text-purple-800 dark:text-purple-300" : "text-indigo-800 dark:text-indigo-300",
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
              isJp1 ? "text-purple-700/80 dark:text-purple-400/80" : "text-indigo-700/80 dark:text-indigo-400/80",
            )}
          >
            Tổng giải đã trao:{" "}
            <span
              className={cn(
                "font-bold tabular-nums text-sm",
                isJp1 ? "text-purple-700 dark:text-purple-300" : "text-indigo-700 dark:text-indigo-300",
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
                hasJp1Winner ? "bg-purple-200 dark:bg-purple-800/60" : "bg-purple-100 dark:bg-purple-900/50",
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
                <span className="font-semibold text-foreground tabular-nums">{formatNumber(totalWinningLines)}</span>{" "}
                line trúng thưởng · Tổng giải{" "}
                <span className="font-semibold text-foreground tabular-nums">{formatNumber(totalPrize)}</span>
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4 pt-0 space-y-4">
          {hasJp1Winner && jp1Tier && (
            <JackpotWinnerBanner winnerCount={jp1Tier.winnerCount} totalPrize={jp1Tier.totalPrize} tier="jp1" />
          )}
          {hasJp2Winner && jp2Tier && (
            <JackpotWinnerBanner winnerCount={jp2Tier.winnerCount} totalPrize={jp2Tier.totalPrize} tier="jp2" />
          )}

          {/* Winning numbers — Power 6/55: 6 số chính + 1 bonus number */}
          <div
            className={cn(
              "w-full flex flex-col items-center gap-3 rounded-xl border px-4 py-4",
              hasJp1Winner || hasJp2Winner
                ? "bg-purple-50/40 border-purple-200/60 dark:bg-purple-950/10 dark:border-purple-800/40"
                : "bg-muted/20",
            )}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex-1" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Kết quả</span>
              <div className="flex-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => setDialogOpen(true)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-primary/70 transition-colors cursor-pointer"
                >
                  <ExternalLink className="size-3" />
                  Phiếu cược trúng thưởng
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {result.winningMain.map((n) => (
                <PowerNumberBall key={n} number={Number(n)} size="md" />
              ))}
              {result.bonusNumber && (
                <>
                  <span className="w-px h-6 bg-border mx-1" />
                  <PowerNumberBall number={Number(result.bonusNumber)} size="md" variant="bonus" />
                </>
              )}
            </div>
          </div>

          {/* Prize table */}
          <div className="rounded-xl border overflow-hidden">
            <div className="grid grid-cols-[minmax(8rem,14rem)_1fr_1fr_1fr] gap-x-2 px-3 py-2 bg-muted/40 border-b">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Hạng giải</span>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
                Lines
              </span>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
                Giá trị thưởng
              </span>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
                Tổng thưởng
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
                    "grid grid-cols-[minmax(8rem,14rem)_1fr_1fr_1fr] gap-x-2 px-3 py-2.5 items-center",
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
                    <Badge variant="outline" className={cn("text-xs border px-2 py-0 h-5", cfg?.badge)}>
                      {t.label}
                    </Badge>
                  </div>

                  <span
                    className={cn(
                      "text-right tabular-nums text-sm font-semibold",
                      hasWinner ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground/40",
                    )}
                  >
                    {formatNumber(t.winnerCount)}
                  </span>

                  <span
                    className={cn(
                      "text-right tabular-nums text-sm",
                      hasWinner ? "text-muted-foreground" : "text-muted-foreground/40",
                    )}
                  >
                    {t.prizeAmount > 0 && hasWinner
                      ? formatNumber(t.prizeAmount)
                      : isJpTier
                        ? "0"
                        : formatNumber(t.prizeAmount)}
                  </span>

                  <span
                    className={cn(
                      "text-right tabular-nums text-sm font-bold",
                      t.totalPrize > 0 ? "text-foreground" : "text-muted-foreground/40",
                    )}
                  >
                    {formatNumber(t.totalPrize)}
                  </span>
                </div>
              );
            })}

            <div className="grid grid-cols-[minmax(8rem,14rem)_1fr_1fr_1fr] gap-x-2 px-3 py-2.5 items-center border-t bg-muted/20">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tổng cộng</span>
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
  /** Chú thích hiển thị qua icon (i) — làm rõ nghĩa khoản mục cho staff. */
  hint?: string;
}

function AccountRow({ row }: { row: LedgerRow }) {
  const Icon = row.icon;
  // Giá trị 0 ở khoản trừ/cộng phụ là trung tính → bỏ dấu +/− và ép muted,
  // tránh "−0"/"+0" gây nhiễu. Dòng kết quả (sign "=") giữ nguyên logic màu.
  const isZeroSide = row.value === 0 && row.sign !== "=";
  const displaySign = isZeroSide ? "" : row.sign;
  const displayColor = isZeroSide ? "text-muted-foreground" : row.valueColor;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 py-2",
        row.separator && "border-t border-border/60 mt-1 pt-3",
        row.indent && "pl-5",
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className={cn("flex size-6 items-center justify-center rounded-md shrink-0", row.iconBg)}>
          <Icon className={cn("size-3.5", row.iconColor)} />
        </div>
        <span className={cn("text-sm", row.bold ? "font-semibold text-foreground" : "text-muted-foreground")}>
          {row.label}
        </span>
        {row.hint && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-help"
                aria-label={`Giải thích ${row.label}`}
              >
                <Info className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{row.hint}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <span className={cn("tabular-nums text-sm font-mono shrink-0", row.bold ? "font-bold" : "", displayColor)}>
        {displaySign !== "=" ? displaySign : ""}
        {formatNumber(row.value)}
      </span>
    </div>
  );
}

export function FinancialSummary({
  financial: f,
  awaitingResettle = false,
}: {
  financial?: DrawFinancialDisplay;
  /** true khi Published sau khi đã từng settle (republish / reopen cascade). */
  awaitingResettle?: boolean;
}) {
  // Chưa có financial (publish lần đầu hoặc sau republish/reopen $unset) —
  // KHÔNG render ledger toàn 0 / Biến động Jackpot lệch.
  if (!f) {
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
                {awaitingResettle ? "Chờ kết sổ lại" : "Chờ kết sổ"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4 pt-0">
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-5 space-y-2">
            <p className="text-sm font-medium text-foreground">
              {awaitingResettle ? "Kỳ đang chờ kết sổ lại" : "Kỳ đang chờ kết sổ"}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Số liệu tài chính và biến động Jackpot sẽ cập nhật sau khi kết sổ hoàn tất. KPI cược phía trên phản ánh số
              liệu live — không phải báo cáo phân bổ doanh thu kỳ này.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Cấu trúc "báo cáo phân bổ doanh thu" — số học liền mạch từ trên xuống:
  //   Doanh thu − Hoa hồng − Giải cố định = Số dư sau giải & HH
  //   Số dư − Trích quỹ Jackpot (JP1+JP2) = Kết quả công ty (P&L kỳ)
  // Kết quả công ty = actualCompanyTake khi kỳ có dư (phần dư còn lại đã trích quỹ),
  // hoặc = số âm khi giải cố định vượt doanh thu (công ty bù phần thiếu).
  const netAfterPrizes = f.totalRevenue - f.totalAgentCommission - f.totalFixedPrizes;
  const totalJpContribution = f.jackpot1Contribution + f.jackpot2Contribution;
  const companyResult = netAfterPrizes - totalJpContribution;
  const companyCapped = f.actualCompanyTake < f.companyTake;

  // Hint dòng kết quả — giải thích đúng theo từng kịch bản để staff không đọc nhầm.
  const resultHint =
    companyResult < 0
      ? "Giải cố định vượt doanh thu — công ty bù phần thiếu. Khoản trao JP1/JP2 (nếu có) trả từ quỹ Jackpot tích luỹ, không tính vào P&L kỳ này."
      : companyCapped
        ? `Bằng phần công ty thực thu. Mức lý thuyết ${formatNumber(f.companyTake)} (doanh thu × tỷ lệ), nhưng kỳ này không đủ dư nên chỉ thực thu ${formatNumber(f.actualCompanyTake)}.`
        : "Bằng phần công ty thực thu (doanh thu × tỷ lệ). Toàn bộ phần dư còn lại đã trích vào 2 quỹ Jackpot.";

  const rows: LedgerRow[] = [
    {
      icon: TrendingUp,
      iconBg: "bg-emerald-100 dark:bg-emerald-900/50",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      label: "Doanh thu gộp",
      value: f.totalRevenue,
      // Dòng input gốc → trung tính, chỉ khoản trừ & kết quả mới có màu ngữ nghĩa
      sign: "+",
      valueColor: "text-foreground",
      bold: true,
    },
    {
      icon: Users,
      iconBg: "bg-slate-100 dark:bg-slate-800",
      iconColor: "text-slate-500 dark:text-slate-400",
      label: "Hoa hồng đại lý",
      value: f.totalAgentCommission,
      // Khoản chi bình thường → muted (không dùng destructive để tránh "báo động giả")
      sign: "-",
      valueColor: "text-muted-foreground",
      indent: true,
    },
    {
      icon: Trophy,
      iconBg: "bg-purple-100 dark:bg-purple-900/50",
      iconColor: "text-purple-600 dark:text-purple-400",
      label: "Chi trả giải cố định",
      value: f.totalFixedPrizes,
      sign: "-",
      valueColor: "text-muted-foreground",
      indent: true,
      hint: "Chỉ gồm các giải cố định (Giải Nhất→Tư). Giải JP1/JP2 trả từ quỹ tích luỹ — xem khối Biến động Jackpot bên dưới.",
    },
    {
      icon: ArrowDownRight,
      iconBg: "bg-blue-100 dark:bg-blue-900/50",
      iconColor: "text-blue-600 dark:text-blue-400",
      label: "Số dư sau giải & hoa hồng",
      value: netAfterPrizes,
      sign: "=",
      valueColor: netAfterPrizes >= 0 ? "text-foreground" : "text-destructive",
      bold: true,
      separator: true,
      hint: "Subtotal trung gian = Doanh thu − Hoa hồng − Giải cố định. Phần dư này được phân bổ cho công ty thực thu và 2 quỹ Jackpot.",
    },
    {
      icon: TrendingDown,
      iconBg: "bg-purple-100 dark:bg-purple-900/50",
      iconColor: "text-purple-600 dark:text-purple-400",
      label: "Trích quỹ Jackpot (JP1+JP2)",
      value: totalJpContribution,
      // Tiền ĐI RA khỏi P&L công ty vào quỹ (liability) → dấu −, muted
      sign: "-",
      valueColor: "text-muted-foreground",
      indent: true,
      hint: `Phần dư còn lại sau khi công ty thực thu ${formatNumber(f.actualCompanyTake)} — trích vào 2 quỹ Jackpot (JP1 ~90%, JP2 ~10%). Kỳ hoà/lỗ → 0. Khi có winner, phần này vẫn được cộng vào pool rồi trao cho người trúng.`,
    },
    {
      icon: Coins,
      iconBg: companyResult >= 0 ? "bg-emerald-100 dark:bg-emerald-900/50" : "bg-red-100 dark:bg-red-900/50",
      iconColor: companyResult >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
      label: "Kết quả công ty (P&L kỳ)",
      value: companyResult,
      sign: "=",
      valueColor: companyResult >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
      bold: true,
      separator: true,
      hint: resultHint,
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
            <CardDescription className="text-xs mt-0.5">Phân bổ doanh thu sau kết sổ</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-0 pt-0">
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
            {/* Nhóm badge bên phải — có thể hiện đồng thời: badge "đã trao" theo pool
                (dual jackpot, cùng kỳ có thể trúng cả hai) + badge tràn quỹ JP1→JP2. */}
            {(f.hasJackpot1Winner || f.hasJackpot2Winner || f.jp1Overflow > 0) && (
              <div className="ml-auto flex items-center gap-1">
                {f.hasJackpot1Winner && (
                  <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-400/40 text-[10px] px-1.5 h-4 gap-1">
                    <Star className="size-2 fill-current" />
                    Trao JP1
                  </Badge>
                )}
                {f.hasJackpot2Winner && (
                  <Badge className="bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-400/40 text-[10px] px-1.5 h-4 gap-1">
                    <Star className="size-2 fill-current" />
                    Trao JP2
                  </Badge>
                )}
                {f.jp1Overflow > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="flex items-center" aria-label="Giải thích tràn quỹ">
                        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-400/40 text-[10px] px-1.5 h-4 gap-1 cursor-help">
                          <Info className="size-2.5" />
                          Tràn JP1→JP2
                        </Badge>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-64">
                      JP1 vượt ngưỡng ({formatNumber(f.jackpot1Before)} +{" "}
                      {formatNumber(f.jackpot1Contribution + f.jp1Overflow)} đóng góp) và kỳ này có người trúng JP2 →
                      phần vượt {formatNumber(f.jp1Overflow)} chuyển sang JP2 trao cho người trúng.
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
          </div>

          {/* JP1 */}
          <div className="divide-y divide-border/30">
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-sm font-medium text-purple-600 dark:text-purple-400">JP1 trước</span>
              <span className="tabular-nums text-sm font-mono text-muted-foreground">
                {formatNumber(f.jackpot1Before)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-sm text-purple-600/70 dark:text-purple-400/70 pl-3">+ Đóng góp</span>
              <span className="tabular-nums text-sm font-mono font-semibold text-purple-600 dark:text-purple-400">
                +{formatNumber(f.jackpot1Contribution + (f.jp1Overflow > 0 ? f.jp1Overflow : 0))}
              </span>
            </div>
            {f.jp1Overflow > 0 && (
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm text-amber-600 dark:text-amber-400 pl-3">→ Tràn sang JP2</span>
                <span className="tabular-nums text-sm font-mono font-semibold text-amber-600 dark:text-amber-400">
                  −{formatNumber(f.jp1Overflow)}
                </span>
              </div>
            )}
            {f.hasJackpot1Winner ? (
              <>
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-sm text-amber-600 dark:text-amber-400 pl-3">− Trao JP1</span>
                  <span className="tabular-nums text-sm font-mono font-semibold text-amber-600 dark:text-amber-400">
                    −{formatNumber(f.jackpot1PrizeAwarded)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2 bg-purple-50/30 dark:bg-purple-950/10">
                  <span className="flex items-center gap-1 text-sm font-bold text-purple-700 dark:text-purple-300 pl-3">
                    JP1 sau
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" aria-label="Giải thích JP1 sau">
                          <Info className="size-3 text-muted-foreground/40 hover:text-muted-foreground" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-64">
                        Đã trao hết cho người trúng JP1. Cycle JP1 đóng, kỳ sau quỹ khởi động lại từ mức seed do công ty
                        ứng.
                      </TooltipContent>
                    </Tooltip>
                  </span>
                  <span className="tabular-nums text-sm font-mono font-bold text-purple-600 dark:text-purple-400">
                    0
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-3 px-3 py-2 bg-purple-50/30 dark:bg-purple-950/10">
                <span className="text-sm font-bold text-purple-700 dark:text-purple-300 pl-3">JP1 sau</span>
                <span className="tabular-nums text-sm font-mono font-bold text-purple-600 dark:text-purple-400">
                  {formatNumber(f.jackpot1After)}
                </span>
              </div>
            )}

            {/* JP2 */}
            <div className="flex items-center justify-between gap-3 px-3 py-2 border-t">
              <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">JP2 trước</span>
              <span className="tabular-nums text-sm font-mono text-muted-foreground">
                {formatNumber(f.jackpot2Before)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-sm text-indigo-600/70 dark:text-indigo-400/70 pl-3">+ Đóng góp</span>
              <span className="tabular-nums text-sm font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                +{formatNumber(f.jackpot2Contribution - (f.jp1Overflow > 0 ? f.jp1Overflow : 0))}
              </span>
            </div>
            {f.jp1Overflow > 0 && (
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm text-amber-600 dark:text-amber-400 pl-3">+ Nhận tràn từ JP1</span>
                <span className="tabular-nums text-sm font-mono font-semibold text-amber-600 dark:text-amber-400">
                  +{formatNumber(f.jp1Overflow)}
                </span>
              </div>
            )}
            {f.hasJackpot2Winner ? (
              <>
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-sm text-amber-600 dark:text-amber-400 pl-3">− Trao JP2</span>
                  <span className="tabular-nums text-sm font-mono font-semibold text-amber-600 dark:text-amber-400">
                    −{formatNumber(f.jackpot2PrizeAwarded)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2 bg-indigo-50/30 dark:bg-indigo-950/10">
                  <span className="flex items-center gap-1 text-sm font-bold text-indigo-700 dark:text-indigo-300 pl-3">
                    JP2 sau
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" aria-label="Giải thích JP2 sau">
                          <Info className="size-3 text-muted-foreground/40 hover:text-muted-foreground" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-64">
                        Đã trao hết cho người trúng JP2. Cycle JP2 đóng, kỳ sau quỹ khởi động lại từ mức seed do công ty
                        ứng.
                      </TooltipContent>
                    </Tooltip>
                  </span>
                  <span className="tabular-nums text-sm font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    0
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-3 px-3 py-2 bg-indigo-50/30 dark:bg-indigo-950/10">
                <span className="text-sm font-bold text-indigo-700 dark:text-indigo-300 pl-3">JP2 sau</span>
                <span className="tabular-nums text-sm font-mono font-bold text-indigo-600 dark:text-indigo-400">
                  {formatNumber(f.jackpot2After)}
                </span>
              </div>
            )}
            {(f.hasJackpot1Winner || f.hasJackpot2Winner) && (
              <div className="px-3 py-1.5 bg-muted/10">
                <p className="text-[11px] text-muted-foreground/70 pl-3">
                  Cycle đã đóng — kỳ kế tiếp quỹ khởi động lại từ mức seed do công ty ứng.
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
