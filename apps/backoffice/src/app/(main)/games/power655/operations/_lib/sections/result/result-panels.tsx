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
    badge: "border-game-max3d bg-game-max3d text-game-max3d",
    row: "bg-game-max3d/60 border-l-2 border-l-game-max3d",
    icon: Gem,
  },
  [PrizeTier.Jackpot2]: {
    badge: "border-info bg-info text-info",
    row: "bg-info/40 border-l-2 border-l-info",
    icon: Zap,
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
      className={cn("relative overflow-hidden rounded-xl border-2", isJp1 ? "border-game-max3d/60" : "border-info/60")}
    >
      <div
        className={cn(
          "absolute inset-0 bg-linear-to-br",
          isJp1 ? "from-game-max3d via-game-max3d to-info" : "from-info via-info to-info",
        )}
      />

      <Sparkles
        className={cn("absolute top-3 right-3 size-4 animate-pulse", isJp1 ? "text-game-max3d/60" : "text-info/60")}
      />

      <div className="relative flex items-center gap-4 px-5 py-4">
        <div
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-full ring-2",
            isJp1 ? "bg-game-max3d/20 ring-game-max3d/40" : "bg-info/20 ring-info/40",
          )}
        >
          {isJp1 ? (
            <Gem className={cn("size-6 drop-shadow-sm", "text-game-max3d")} />
          ) : (
            <Zap className={cn("size-6 drop-shadow-sm", "text-info")} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={cn("text-sm font-bold tracking-tight", isJp1 ? "text-game-max3d" : "text-info")}>
              🎉 {isJp1 ? "JACKPOT 1" : "JACKPOT 2"} — CÓ NGƯỜI TRÚNG!
            </p>
            <Badge
              className={cn(
                "h-4.5 gap-1 border px-2 text-xs",
                isJp1 ? "border-game-max3d/50 bg-game-max3d/20 text-game-max3d" : "border-info/50 bg-info/20 text-info",
              )}
            >
              <Star className="size-2.5 fill-current" />
              {winnerCount} line trúng
            </Badge>
          </div>
          <p className={cn("mt-0.5 text-xs", isJp1 ? "text-game-max3d/80" : "text-info/80")}>
            Tổng giải đã trao:{" "}
            <span className={cn("text-sm font-bold tabular-nums", isJp1 ? "text-game-max3d" : "text-info")}>
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
      <Card className={cn("gap-0 py-0 shadow-sm", (hasJp1Winner || hasJp2Winner) && "ring-game-max3d/40 ring-1")}>
        <CardHeader className="px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-lg",
                hasJp1Winner ? "bg-game-max3d" : "bg-game-max3d",
              )}
            >
              {hasJp1Winner ? (
                <Gem className="text-game-max3d size-3.5" />
              ) : (
                <Trophy className="text-game-max3d size-3.5" />
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
        <CardContent className="space-y-4 px-5 pt-0 pb-4">
          {hasJp1Winner && jp1Tier && (
            <JackpotWinnerBanner winnerCount={jp1Tier.winnerCount} totalPrize={jp1Tier.totalPrize} tier="jp1" />
          )}
          {hasJp2Winner && jp2Tier && (
            <JackpotWinnerBanner winnerCount={jp2Tier.winnerCount} totalPrize={jp2Tier.totalPrize} tier="jp2" />
          )}

          {/* Winning numbers — Power 6/55: 6 số chính + 1 bonus number */}
          <div
            className={cn(
              "flex w-full flex-col items-center gap-3 rounded-xl border px-4 py-4",
              hasJp1Winner || hasJp2Winner ? "border-game-max3d/60 bg-game-max3d/40" : "bg-muted/20",
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
              {result.winningMain.map((n) => (
                <PowerNumberBall key={n} number={Number(n)} size="md" />
              ))}
              {result.bonusNumber && (
                <>
                  <span className="bg-border mx-1 h-6 w-px" />
                  <PowerNumberBall number={Number(result.bonusNumber)} size="md" variant="bonus" />
                </>
              )}
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
              const isJpTier = t.tier === PrizeTier.Jackpot1 || t.tier === PrizeTier.Jackpot2;
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
                          t.tier === PrizeTier.Jackpot1 && "text-game-max3d",
                          t.tier === PrizeTier.Jackpot2 && "text-info",
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
                    {t.prizeAmount > 0 && hasWinner
                      ? formatNumber(t.prizeAmount)
                      : isJpTier
                        ? "0"
                        : formatNumber(t.prizeAmount)}
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
      iconBg: "bg-game-max3d",
      iconColor: "text-game-max3d",
      label: "Chi trả giải cố định",
      value: f.totalFixedPrizes,
      sign: "-",
      valueColor: "text-muted-foreground",
      indent: true,
      hint: "Chỉ gồm các giải cố định (Giải Nhất→Tư). Giải JP1/JP2 trả từ quỹ tích luỹ — xem khối Biến động Jackpot bên dưới.",
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
      hint: "Subtotal trung gian = Doanh thu − Hoa hồng − Giải cố định. Phần dư này được phân bổ cho công ty thực thu và 2 quỹ Jackpot.",
    },
    {
      icon: TrendingDown,
      iconBg: "bg-game-max3d",
      iconColor: "text-game-max3d",
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

        {/* Biến động Jackpot kép — JP1 + JP2 */}
        <div className="border-border/60 bg-muted/20 mt-2 overflow-hidden rounded-xl border">
          <div className="border-border/40 bg-muted/30 flex items-center gap-2 border-b px-3 py-2">
            <Gem className="text-game-max3d size-3.5 shrink-0" />
            <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Biến động Jackpot
            </span>
            {/* Nhóm badge bên phải — có thể hiện đồng thời: badge "đã trao" theo pool
                (dual jackpot, cùng kỳ có thể trúng cả hai) + badge tràn quỹ JP1→JP2. */}
            {(f.hasJackpot1Winner || f.hasJackpot2Winner || f.jp1Overflow > 0) && (
              <div className="ml-auto flex items-center gap-1">
                {f.hasJackpot1Winner && (
                  <Badge className="border-game-max3d/40 bg-game-max3d/15 text-game-max3d h-4 gap-1 border px-1.5 text-xs">
                    <Star className="size-2 fill-current" />
                    Trao JP1
                  </Badge>
                )}
                {f.hasJackpot2Winner && (
                  <Badge className="border-info/40 bg-info/15 text-info h-4 gap-1 border px-1.5 text-xs">
                    <Star className="size-2 fill-current" />
                    Trao JP2
                  </Badge>
                )}
                {f.jp1Overflow > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="flex items-center" aria-label="Giải thích tràn quỹ">
                        <Badge className="border-warning/40 bg-warning/15 text-warning h-4 cursor-help gap-1 border px-1.5 text-xs">
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
          <div className="divide-border/30 divide-y">
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-game-max3d text-sm font-medium">JP1 trước</span>
              <span className="text-muted-foreground font-mono text-sm tabular-nums">
                {formatNumber(f.jackpot1Before)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-game-max3d/70 pl-3 text-sm">+ Đóng góp</span>
              <span className="text-game-max3d font-mono text-sm font-semibold tabular-nums">
                +{formatNumber(f.jackpot1Contribution + (f.jp1Overflow > 0 ? f.jp1Overflow : 0))}
              </span>
            </div>
            {f.jp1Overflow > 0 && (
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-warning pl-3 text-sm">→ Tràn sang JP2</span>
                <span className="text-warning font-mono text-sm font-semibold tabular-nums">
                  −{formatNumber(f.jp1Overflow)}
                </span>
              </div>
            )}
            {f.hasJackpot1Winner ? (
              <>
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-warning pl-3 text-sm">− Trao JP1</span>
                  <span className="text-warning font-mono text-sm font-semibold tabular-nums">
                    −{formatNumber(f.jackpot1PrizeAwarded)}
                  </span>
                </div>
                <div className="bg-game-max3d/30 flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-game-max3d flex items-center gap-1 pl-3 text-sm font-bold">
                    JP1 sau
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" aria-label="Giải thích JP1 sau">
                          <Info className="text-muted-foreground/40 hover:text-muted-foreground size-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-64">
                        Đã trao hết cho người trúng JP1. Cycle JP1 đóng, kỳ sau quỹ khởi động lại từ mức seed do công ty
                        ứng.
                      </TooltipContent>
                    </Tooltip>
                  </span>
                  <span className="text-game-max3d font-mono text-sm font-bold tabular-nums">0</span>
                </div>
              </>
            ) : (
              <div className="bg-game-max3d/30 flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-game-max3d pl-3 text-sm font-bold">JP1 sau</span>
                <span className="text-game-max3d font-mono text-sm font-bold tabular-nums">
                  {formatNumber(f.jackpot1After)}
                </span>
              </div>
            )}

            {/* JP2 */}
            <div className="flex items-center justify-between gap-3 border-t px-3 py-2">
              <span className="text-info text-sm font-medium">JP2 trước</span>
              <span className="text-muted-foreground font-mono text-sm tabular-nums">
                {formatNumber(f.jackpot2Before)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-info/70 pl-3 text-sm">+ Đóng góp</span>
              <span className="text-info font-mono text-sm font-semibold tabular-nums">
                +{formatNumber(f.jackpot2Contribution - (f.jp1Overflow > 0 ? f.jp1Overflow : 0))}
              </span>
            </div>
            {f.jp1Overflow > 0 && (
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-warning pl-3 text-sm">+ Nhận tràn từ JP1</span>
                <span className="text-warning font-mono text-sm font-semibold tabular-nums">
                  +{formatNumber(f.jp1Overflow)}
                </span>
              </div>
            )}
            {f.hasJackpot2Winner ? (
              <>
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-warning pl-3 text-sm">− Trao JP2</span>
                  <span className="text-warning font-mono text-sm font-semibold tabular-nums">
                    −{formatNumber(f.jackpot2PrizeAwarded)}
                  </span>
                </div>
                <div className="bg-info/30 flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-info flex items-center gap-1 pl-3 text-sm font-bold">
                    JP2 sau
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" aria-label="Giải thích JP2 sau">
                          <Info className="text-muted-foreground/40 hover:text-muted-foreground size-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-64">
                        Đã trao hết cho người trúng JP2. Cycle JP2 đóng, kỳ sau quỹ khởi động lại từ mức seed do công ty
                        ứng.
                      </TooltipContent>
                    </Tooltip>
                  </span>
                  <span className="text-info font-mono text-sm font-bold tabular-nums">0</span>
                </div>
              </>
            ) : (
              <div className="bg-info/30 flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-info pl-3 text-sm font-bold">JP2 sau</span>
                <span className="text-info font-mono text-sm font-bold tabular-nums">
                  {formatNumber(f.jackpot2After)}
                </span>
              </div>
            )}
            {(f.hasJackpot1Winner || f.hasJackpot2Winner) && (
              <div className="bg-muted/10 px-3 py-1.5">
                <p className="text-muted-foreground/70 pl-3 text-xs">
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
