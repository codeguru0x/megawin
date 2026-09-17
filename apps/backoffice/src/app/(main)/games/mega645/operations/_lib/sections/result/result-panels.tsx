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

import { PrizeTier } from "@megawin/game-mega645/entities";
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
} from "lucide-react";

import { MegaNumberBall } from "@/components/games/mega645/mega-number-ball";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { DrawFinancialDisplay, DrawResult } from "../../types";
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
    badge: "border-game-mega645 bg-game-mega645 text-game-mega645",
    row: "bg-game-mega645/60 border-l-2 border-l-game-mega645",
    icon: Gem,
  },
  [PrizeTier.Tier1]: {
    badge: "border-profit bg-profit text-profit",
    row: "bg-profit/40",
    icon: Trophy,
  },
  [PrizeTier.Tier2]: {
    badge: "border-info bg-info text-info",
    row: "bg-info/30",
  },
  [PrizeTier.Tier3]: {
    badge: "border-info bg-info text-info",
    row: "",
  },
};

// ─── Jackpot Winner Banner ────────────────────────────────────────────────────

function JackpotWinnerBanner({ winnerCount, totalPrize }: { winnerCount: number; totalPrize: number }) {
  return (
    <div className="border-game-mega645/60 relative overflow-hidden rounded-xl border-2">
      <div className="from-game-mega645 via-profit to-info absolute inset-0 bg-linear-to-br" />
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2.5s_ease-in-out_infinite] bg-linear-to-r from-transparent via-white/40 to-transparent dark:via-white/10" />

      <Sparkles className="text-game-mega645/60 absolute top-3 right-3 size-4 animate-pulse" />
      <Sparkles className="text-profit/50 absolute bottom-3 left-3 size-3 animate-pulse [animation-delay:0.8s]" />

      <div className="relative flex items-center gap-4 px-5 py-4">
        <div className="bg-game-mega645/20 ring-game-mega645/40 flex size-12 shrink-0 items-center justify-center rounded-full ring-2">
          <Gem className="text-game-mega645 size-6 drop-shadow-sm" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-game-mega645 text-sm font-bold tracking-tight">🎉 ĐỘC ĐẮC — CÓ NGƯỜI TRÚNG!</p>
            <Badge className="border-game-mega645/50 bg-game-mega645/20 text-game-mega645 h-4.5 gap-1 border px-2 text-xs">
              <Star className="size-2.5 fill-current" />
              {winnerCount} line trúng
            </Badge>
          </div>
          <p className="text-game-mega645/80 mt-0.5 text-xs">
            Tổng giải Jackpot đã trao:{" "}
            <span className="text-game-mega645 text-sm font-bold tabular-nums">{formatNumber(totalPrize)}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Jackpot Row (special full-width treatment) ──────────────────────────────

function JackpotWinnerRow({ t }: { t: DrawResult["tiers"][number] }) {
  return (
    <div className="border-game-mega645/70 relative overflow-hidden border-b">
      <div className="from-game-mega645/80 via-profit/60 to-game-mega645/30 absolute inset-0 bg-linear-to-r dark:to-transparent" />
      <div className="relative grid grid-cols-[minmax(8rem,14rem)_1fr_1fr_1fr] items-center gap-x-2 px-3 py-3">
        <div className="flex items-center gap-2">
          <Gem className="text-game-mega645 size-3.5 shrink-0 animate-pulse" />
          <Badge
            variant="outline"
            className="border-game-mega645 bg-game-mega645 text-game-mega645 h-5 gap-1 px-2 py-0 text-xs"
          >
            <Star className="fill-game-mega645 text-game-mega645 size-2.5" />
            {t.label}
          </Badge>
        </div>
        <span className="text-game-mega645 text-right text-sm font-bold tabular-nums">
          {formatNumber(t.winnerCount)}
        </span>
        <span className="text-game-mega645/70 text-right text-sm tabular-nums">{formatNumber(t.prizeAmount)}</span>
        <span className="text-game-mega645 text-right text-sm font-bold tabular-nums">
          {formatNumber(t.totalPrize)}
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
      <Card className={cn("shadow-sm", hasJackpotWinner && "ring-game-mega645/40 ring-1")}>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-lg",
                hasJackpotWinner ? "bg-game-mega645" : "bg-game-mega645",
              )}
            >
              {hasJackpotWinner ? (
                <Gem className="text-game-mega645 size-3.5" />
              ) : (
                <Trophy className="text-game-mega645 size-3.5" />
              )}
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Kết quả & Phân bổ giải thưởng</CardTitle>
              <CardDescription className="mt-0.5 text-xs">
                <span className="text-foreground font-semibold tabular-nums">{formatNumber(totalWinningLines)}</span>{" "}
                line trúng thưởng · Tổng giải{" "}
                <span className="text-foreground font-semibold tabular-nums">{formatNumber(totalPrize)}</span>
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {hasJackpotWinner && jackpotTier && (
            <JackpotWinnerBanner winnerCount={jackpotTier.winnerCount} totalPrize={jackpotTier.totalPrize} />
          )}

          {/* Winning numbers — Mega 6/45: 6 số chính, không có specialNumber */}
          <div
            className={cn(
              "flex w-full flex-col items-center gap-3 rounded-xl border px-4 py-4",
              hasJackpotWinner ? "border-game-mega645/60 bg-game-mega645/40" : "bg-muted/20",
            )}
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex-1" />
              <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Kết quả</span>
              <div className="flex flex-1 justify-end">
                <button
                  type="button"
                  onClick={() => setDialogOpen(true)}
                  className="text-muted-foreground/60 hover:text-primary/70 flex cursor-pointer items-center gap-1 text-xs transition-colors"
                >
                  <ExternalLink className="size-3" />
                  Phiếu cược trúng thưởng
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {result.winningNumbers.map((n) => (
                <MegaNumberBall key={n} number={Number(n)} size="md" />
              ))}
            </div>
          </div>

          {/* Prize table */}
          <div className="overflow-hidden rounded-xl border">
            <div className="bg-muted/40 grid grid-cols-[minmax(8rem,14rem)_1fr_1fr_1fr] gap-x-2 border-b px-3 py-2">
              <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">Hạng giải</span>
              <span className="text-muted-foreground text-right text-xs font-medium tracking-wider uppercase">
                Lines
              </span>
              <span className="text-muted-foreground text-right text-xs font-medium tracking-wider uppercase">
                Giá trị thưởng
              </span>
              <span className="text-muted-foreground text-right text-xs font-medium tracking-wider uppercase">
                Tổng thưởng
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
                    "grid grid-cols-[minmax(8rem,14rem)_1fr_1fr_1fr] items-center gap-x-2 px-3 py-2.5",
                    idx < result.tiers.length - 1 && "border-border/50 border-b",
                    hasWinner ? cfg?.row : "",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {IconComp ? (
                      <IconComp
                        className={cn(
                          "size-3.5 shrink-0",
                          t.tier === PrizeTier.Jackpot && "text-game-mega645",
                          t.tier === PrizeTier.Tier1 && "text-profit",
                        )}
                      />
                    ) : (
                      <span className="size-3.5 shrink-0" />
                    )}
                    <Badge variant="outline" className={cn("h-5 border px-2 py-0 text-xs", cfg?.badge)}>
                      {t.label}
                    </Badge>
                  </div>

                  <span
                    className={cn(
                      "text-right text-sm font-semibold tabular-nums",
                      hasWinner ? "text-profit" : "text-muted-foreground/40",
                    )}
                  >
                    {formatNumber(t.winnerCount)}
                  </span>

                  <span
                    className={cn(
                      "text-right text-sm tabular-nums",
                      hasWinner ? "text-muted-foreground" : "text-muted-foreground/40",
                    )}
                  >
                    {formatNumber(t.prizeAmount)}
                  </span>

                  <span
                    className={cn(
                      "text-right text-sm font-bold tabular-nums",
                      t.totalPrize > 0 ? "text-foreground" : "text-muted-foreground/40",
                    )}
                  >
                    {formatNumber(t.totalPrize)}
                  </span>
                </div>
              );
            })}

            <div className="bg-muted/20 grid grid-cols-[minmax(8rem,14rem)_1fr_1fr_1fr] items-center gap-x-2 border-t px-3 py-2.5">
              <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Tổng cộng</span>
              <span className="text-foreground text-right text-sm font-bold tabular-nums">
                {formatNumber(totalWinningLines)}
              </span>
              <span />
              <span className="text-foreground text-right text-sm font-bold tabular-nums">
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
        row.separator && "border-border/60 mt-1 border-t pt-3",
        row.indent && "pl-5",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", row.iconBg)}>
          <Icon className={cn("size-3.5", row.iconColor)} />
        </div>
        <span className={cn("text-sm", row.bold ? "text-foreground font-semibold" : "text-muted-foreground")}>
          {row.label}
        </span>
        {row.hint && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground/40 hover:text-muted-foreground shrink-0 cursor-help transition-colors"
                aria-label={`Giải thích ${row.label}`}
              >
                <Info className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{row.hint}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <span className={cn("shrink-0 font-mono text-sm tabular-nums", row.bold ? "font-bold" : "", displayColor)}>
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
            <div className="bg-info flex size-7 shrink-0 items-center justify-center rounded-lg">
              <Coins className="text-info size-3.5" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Tài chính kỳ</CardTitle>
              <CardDescription className="mt-0.5 text-xs">
                {awaitingResettle ? "Chờ kết sổ lại" : "Chờ kết sổ"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 pt-0 pb-4">
          <div className="border-border/70 bg-muted/20 space-y-2 rounded-xl border border-dashed px-4 py-5">
            <p className="text-foreground text-sm font-medium">
              {awaitingResettle ? "Kỳ đang chờ kết sổ lại" : "Kỳ đang chờ kết sổ"}
            </p>
            <p className="text-muted-foreground text-xs leading-relaxed">
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
  //   Số dư − Trích quỹ Jackpot = Kết quả công ty (P&L kỳ)
  // Kết quả công ty = actualCompanyTake khi kỳ có dư (phần dư còn lại đã trích quỹ JP),
  // hoặc = số âm khi giải cố định vượt doanh thu (công ty bù phần thiếu).
  const netAfterPrizes = f.totalRevenue - f.totalAgentCommission - f.totalFixedPrizes;
  const companyResult = netAfterPrizes - f.jackpotContribution;
  // Công ty bị giới hạn thu (kỳ không đủ dư để lấy đủ phần lý thuyết).
  const companyCapped = f.actualCompanyTake < f.companyTake;

  // Hint dòng kết quả — giải thích đúng theo từng kịch bản để staff không đọc nhầm.
  const resultHint =
    companyResult < 0
      ? "Giải cố định vượt doanh thu — công ty bù phần thiếu. Khoản trao độc đắc (nếu có) trả từ quỹ Jackpot tích luỹ, không tính vào P&L kỳ này."
      : companyCapped
        ? `Bằng phần công ty thực thu. Mức lý thuyết ${formatNumber(f.companyTake)} (doanh thu × tỷ lệ), nhưng kỳ này không đủ dư nên chỉ thực thu ${formatNumber(f.actualCompanyTake)}.`
        : "Bằng phần công ty thực thu (doanh thu × tỷ lệ). Toàn bộ phần dư còn lại đã trích vào quỹ Jackpot.";

  const rows: LedgerRow[] = [
    {
      icon: TrendingUp,
      iconBg: "bg-profit",
      iconColor: "text-profit",
      label: "Doanh thu gộp",
      value: f.totalRevenue,
      // Dòng input gốc → trung tính, chỉ khoản trừ & kết quả mới có màu ngữ nghĩa
      sign: "+",
      valueColor: "text-foreground",
      bold: true,
    },
    {
      icon: Users,
      iconBg: "bg-muted",
      iconColor: "text-muted-foreground",
      label: "Hoa hồng đại lý",
      value: f.totalAgentCommission,
      // Khoản chi bình thường → muted (không dùng destructive để tránh "báo động giả")
      sign: "-",
      valueColor: "text-muted-foreground",
      indent: true,
    },
    {
      icon: Trophy,
      iconBg: "bg-game-mega645",
      iconColor: "text-game-mega645",
      label: "Chi trả giải cố định",
      value: f.totalFixedPrizes,
      sign: "-",
      valueColor: "text-muted-foreground",
      indent: true,
      hint: "Chỉ gồm các giải cố định (Giải Nhất/Nhì/Ba). Giải Jackpot trả từ quỹ tích luỹ — xem khối Biến động Jackpot bên dưới.",
    },
    {
      icon: ArrowDownRight,
      iconBg: "bg-info",
      iconColor: "text-info",
      label: "Số dư sau giải & hoa hồng",
      value: netAfterPrizes,
      sign: "=",
      valueColor: netAfterPrizes >= 0 ? "text-foreground" : "text-destructive",
      bold: true,
      separator: true,
      hint: "Subtotal trung gian = Doanh thu − Hoa hồng − Giải cố định. Phần dư này được phân bổ cho công ty thực thu và quỹ Jackpot.",
    },
    {
      icon: TrendingDown,
      iconBg: "bg-game-mega645",
      iconColor: "text-game-mega645",
      label: "Trích quỹ Jackpot",
      value: f.jackpotContribution,
      // Tiền ĐI RA khỏi P&L công ty vào quỹ (liability) → dấu −, muted
      sign: "-",
      valueColor: "text-muted-foreground",
      indent: true,
      hint: `Phần dư còn lại sau khi công ty thực thu ${formatNumber(f.actualCompanyTake)} — trích vào quỹ Jackpot. Kỳ hoà/lỗ → 0. Khi có người trúng độc đắc, khoản này vẫn được cộng vào pool rồi trao cho winner.`,
    },
    {
      icon: Coins,
      iconBg: companyResult >= 0 ? "bg-profit" : "bg-loss",
      iconColor: companyResult >= 0 ? "text-profit" : "text-loss",
      label: "Kết quả công ty (P&L kỳ)",
      value: companyResult,
      sign: "=",
      valueColor: companyResult >= 0 ? "text-profit" : "text-destructive",
      bold: true,
      separator: true,
      hint: resultHint,
    },
  ];

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="bg-info flex size-7 shrink-0 items-center justify-center rounded-lg">
            <Coins className="text-info size-3.5" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Tài chính kỳ</CardTitle>
            <CardDescription className="mt-0.5 text-xs">Phân bổ doanh thu sau kết sổ</CardDescription>
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
        <div className="border-border/60 bg-muted/20 mt-2 overflow-hidden rounded-xl border">
          <div className="border-border/40 bg-muted/30 flex items-center gap-2 border-b px-3 py-2">
            <Gem className="text-game-mega645 size-3.5 shrink-0" />
            <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Biến động Jackpot
            </span>
            {f.hasJackpotWinner && (
              <Badge className="border-game-mega645/40 bg-game-mega645/15 text-game-mega645 ml-auto h-4 gap-1 border px-1.5 text-xs">
                <Star className="size-2 fill-current" />
                Đã trao
              </Badge>
            )}
          </div>
          <div className="divide-border/40 divide-y">
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-muted-foreground pl-8 text-sm">Quỹ trước kỳ</span>
              <span className="text-muted-foreground shrink-0 font-mono text-sm tabular-nums">
                {formatNumber(f.jackpotBefore)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-game-mega645 pl-8 text-sm">+ Đóng góp kỳ</span>
              <span className="text-game-mega645 shrink-0 font-mono text-sm font-semibold tabular-nums">
                +{formatNumber(f.jackpotContribution)}
              </span>
            </div>

            {f.hasJackpotWinner ? (
              <>
                {/* Có winner: toàn bộ pool (trước kỳ + đóng góp) được trao cho người trúng. */}
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-warning pl-8 text-sm">− Trao độc đắc</span>
                  <span className="text-warning shrink-0 font-mono text-sm font-semibold tabular-nums">
                    −{formatNumber(f.jackpotPrizeAwarded)}
                  </span>
                </div>
                <div className="bg-muted/20 flex items-center justify-between gap-3 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-1.5 pl-8">
                    <span className="text-foreground text-sm font-bold">Quỹ sau kỳ</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground/40 hover:text-muted-foreground shrink-0 cursor-help transition-colors"
                          aria-label="Giải thích quỹ sau kỳ"
                        >
                          <Info className="size-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-64">
                        Đã trao hết pool cho người trúng độc đắc. Chu kỳ Jackpot đóng lại, kỳ kế tiếp quỹ khởi động lại
                        từ mức seed theo cấu hình — khoản seed này do công ty ứng (nghĩa vụ tài chính của chu kỳ mới).
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <span className="text-foreground shrink-0 font-mono text-sm font-bold tabular-nums">0</span>
                </div>
                <div className="bg-muted/10 px-3 py-1.5">
                  <p className="text-muted-foreground/70 pl-8 text-xs">
                    Kỳ kế tiếp quỹ khởi động lại từ mức seed do công ty ứng.
                  </p>
                </div>
              </>
            ) : (
              <div className="bg-muted/20 flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-foreground pl-8 text-sm font-bold">Quỹ sau kỳ</span>
                <span className="text-game-mega645 shrink-0 font-mono text-sm font-bold tabular-nums">
                  {formatNumber(f.jackpotAfter)}
                </span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
