"use client";

import Link from "next/link";
import {
  Ticket,
  Building2,
  User,
  Clock,
  Layers,
  Banknote,
  HandCoins,
  CheckCircle2,
  XCircle,
  Timer,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber, toTenantUsername, formatVN } from "@megawin/shared/utils";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import type { TicketEntryEntity, EntryPayoutTier } from "@megawin/game-power655/entities";
import {
  POWER655_PRIZE_TIER_LABELS,
  getPower655PlayTypeLabel,
} from "@megawin/game-power655/labels";
import { PrizeTier } from "@megawin/game-power655/entities";
import { EntryStatus } from "@megawin/game-core/entities";
// ─── Board Color Map ──────────────────────────────────────────────────────────

const BOARD_COLORS: Record<string, string> = {
  A: "var(--board-a)",
  B: "var(--board-b)",
  C: "var(--board-c)",
  D: "var(--board-d)",
  E: "var(--board-e)",
  F: "var(--board-f)",
};

// ─── Ball Display Helpers ─────────────────────────────────────────────────────

/**
 * Hiển thị 1 quả bóng số tròn.
 * - matched (xanh chính): trùng số chính thắng
 * - bonus (amber): trùng số bonus
 * - default (muted): chưa có kết quả hoặc không trúng
 */
function Ball({
  n,
  variant = "default",
  size = "md",
}: {
  n: string;
  variant?: "default" | "matched" | "bonus" | "result" | "result-bonus";
  size?: "sm" | "md";
}) {
  const sizeClass = size === "sm" ? "size-7 text-[11px]" : "size-8 text-xs";
  const colorClass =
    variant === "matched"
      ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
      : variant === "bonus"
        ? "bg-amber-500 text-white ring-2 ring-amber-300/40"
        : variant === "result"
          ? "bg-muted/60 text-muted-foreground/60"
          : variant === "result-bonus"
            ? "bg-amber-200/60 text-amber-700/60 dark:bg-amber-900/40 dark:text-amber-400/60"
            : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold tabular-nums ${sizeClass} ${colorClass}`}
    >
      {n}
    </span>
  );
}

// ─── Entry Detail Dialog ──────────────────────────────────────────────────────

/**
 * Chi tiết 1 entry Power 6/55.
 *
 * Layout:
 * 1. Header: title + "ticketNo · drawId" (DialogDescription)
 * 2. Metadata strip (4 ô): Đại lý · Người chơi · Dòng cược · Thời gian đặt
 * 3. Financial KPI:
 *    - Outstanding: Tiền cược · Hoa hồng (2 ô)
 *    - Settled: Tiền cược · Trả thưởng · Hoa hồng · Lãi/lỗ (4 ô)
 * 4. Kết quả kỳ quay (6 main + 1 bonus — chỉ khi có result, không phải scheduled)
 * 5. Bộ số đã chọn: boards A-E (6 số chính / board — highlight khi khớp)
 *    Power 6/55: KHÔNG có bonus per-board (bonus là số quay riêng từ pool còn lại)
 * 6. Giải trúng (chỉ khi có payout.tiers và không phải scheduled)
 */
export function Power655EntryDetailDialog({
  entry,
  open,
  onClose,
}: {
  entry: TicketEntryEntity | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!entry) return null;

  const tiers = entry.payout?.tiers ?? [];
  const TIER_ORDER: Record<string, number> = {
    [PrizeTier.Jackpot1]: 0,
    [PrizeTier.Jackpot2]: 1,
    [PrizeTier.Tier1]: 2,
    [PrizeTier.Tier2]: 3,
    [PrizeTier.Tier3]: 4,
  };
  const sortedTiers = [...tiers].sort(
    (a, b) => (TIER_ORDER[a.tier] ?? 99) - (TIER_ORDER[b.tier] ?? 99),
  );
  const boards = entry.entrySummary.boards ?? [];
  const isScheduled = entry.status === EntryStatus.Scheduled;
  const isSettled = entry.status === EntryStatus.Settled;
  const isVoid = entry.status === EntryStatus.Void;

  let playerNet = null;

  if (isSettled) {
    playerNet = (entry.payout?.payoutAmount ?? 0) - entry.amount;
  }

  if (isVoid) {
    playerNet = (entry.voidInfo?.refundAmount ?? 0) - (entry.voidInfo?.originalAmount ?? 0);
  }

  const winningSet = new Set<string>(entry.result?.winningMain ?? []);
  const bonusNumber = entry.result?.bonusNumber;

  const tenantUsername = toTenantUsername(entry.username);
  const playerLink = `/accounts/players/${entry.accountId}`;
  const MAX_USERNAME_LEN = 14;
  const truncatedUsername =
    tenantUsername.length > MAX_USERNAME_LEN
      ? tenantUsername.slice(0, MAX_USERNAME_LEN) + "…"
      : tenantUsername;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-base">
            {isSettled ? (
              <span className="inline-flex items-center justify-center rounded-full bg-emerald-500/15 p-1">
                <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
              </span>
            ) : isVoid ? (
              <span className="inline-flex items-center justify-center rounded-full bg-destructive/15 p-1">
                <XCircle className="size-5 shrink-0 text-destructive" />
              </span>
            ) : (
              <span className="inline-flex items-center justify-center rounded-full bg-amber-500/15 p-1">
                <Timer className="size-5 shrink-0 text-amber-500" />
              </span>
            )}
            Phiếu cược — Power 6/55
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 font-mono text-xs">
            <Ticket className="size-3 shrink-0 text-muted-foreground" />
            {entry.entrySummary.ticketNo} · {entry.drawId}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[76vh]">
          <div className="space-y-4 pr-2">
            {/* ── 1. Metadata 2-column ─────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 rounded-lg bg-muted/50 px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <User className="size-3.5 shrink-0" />
                  Người chơi
                </span>
                {tenantUsername.length > MAX_USERNAME_LEN ? (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href={playerLink}
                          className="cursor-pointer font-semibold hover:underline"
                        >
                          {truncatedUsername}
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="font-mono text-xs">{tenantUsername}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <Link href={playerLink} className="font-semibold hover:underline">
                    {tenantUsername}
                  </Link>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Layers className="size-3.5 shrink-0" />
                  {REPORT_COLUMN_LABELS.lineCount}
                </span>
                <span className="font-semibold tabular-nums">{formatNumber(entry.lineCount)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Building2 className="size-3.5 shrink-0" />
                  Đại lý
                </span>
                <span className="font-semibold">{(entry as any).tenantId ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Clock className="size-3.5 shrink-0" />
                  Đặt lúc
                </span>
                <span className="font-semibold tabular-nums">
                  {formatVN(new Date(entry.createdAt as unknown as string), "HH:mm dd/MM")}
                </span>
              </div>
            </div>

            {/* ── 2. Financial KPI strip ──────────────────────────────────────── */}
            {isScheduled ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-900/50">
                    <Banknote className="size-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      Tiền cược
                      {entry.betUnitCount > 1 && (
                        <span className="rounded bg-muted px-1 py-px text-[10px] font-medium text-muted-foreground">
                          ×{formatNumber(entry.betUnitCount)}
                        </span>
                      )}
                    </p>
                    <p className="text-sm font-bold tabular-nums">{formatNumber(entry.amount)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900/50">
                    <HandCoins className="size-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">
                      {REPORT_COLUMN_LABELS.totalCommission}
                    </p>
                    <p className="text-sm font-bold tabular-nums">
                      {formatNumber(entry.tenant.commissionAmount)}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-900/50">
                    <Banknote className="size-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      Tiền cược
                      {entry.betUnitCount > 1 && (
                        <span className="rounded bg-muted px-1 py-px text-[10px] font-medium text-muted-foreground">
                          ×{formatNumber(entry.betUnitCount)}
                        </span>
                      )}
                    </p>
                    <p className="text-sm font-bold tabular-nums">{formatNumber(entry.amount)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-900/50">
                    <Banknote className="size-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">
                      {REPORT_COLUMN_LABELS.totalPayout}
                    </p>
                    <p className="text-sm font-bold tabular-nums">
                      {formatNumber(entry.payout?.payoutAmount ?? 0)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900/50">
                    <HandCoins className="size-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">
                      {REPORT_COLUMN_LABELS.totalCommission}
                    </p>
                    <p className="text-sm font-bold tabular-nums">
                      {formatNumber(entry.tenant.commissionAmount)}
                    </p>
                  </div>
                </div>
                {playerNet !== null && (
                  <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                    <div
                      className={`flex size-8 shrink-0 items-center justify-center rounded-md ${
                        playerNet > 0
                          ? "bg-emerald-100 dark:bg-emerald-900/50"
                          : playerNet < 0
                            ? "bg-red-100 dark:bg-red-900/50"
                            : "bg-muted"
                      }`}
                    >
                      {playerNet > 0 ? (
                        <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" />
                      ) : playerNet < 0 ? (
                        <TrendingDown className="size-4 text-red-600 dark:text-red-400" />
                      ) : (
                        <Minus className="size-4 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">
                        {REPORT_COLUMN_LABELS.playerNetProfit}
                      </p>
                      <p
                        className={`text-sm font-bold tabular-nums ${
                          playerNet > 0
                            ? "text-profit"
                            : playerNet < 0
                              ? "text-loss"
                              : "text-foreground"
                        }`}
                      >
                        {playerNet > 0 ? "+" : ""}
                        {formatNumber(playerNet)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── 4. Kết quả & Bộ số đã chọn ─────────────────────────────── */}
            {entry.result && !isScheduled && boards.length > 0 ? (
              <div className="rounded-lg border p-4">
                <p className="mb-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Kết quả
                </p>
                <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
                  {entry.result.winningMain.map((n: string) => {
                    const playerPicked = boards.some((b) => b.mainNumbers.includes(n));
                    return <Ball key={n} n={n} variant={playerPicked ? "matched" : "result"} />;
                  })}
                  {bonusNumber && (
                    <>
                      <span className="text-muted-foreground/40 select-none">|</span>
                      <Ball
                        n={bonusNumber}
                        variant={
                          boards.some((b) => b.mainNumbers.includes(bonusNumber))
                            ? "bonus"
                            : "result-bonus"
                        }
                      />
                    </>
                  )}
                </div>

                <div className="mb-3 border-t" />

                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Bộ số đã chọn
                </p>
                <div className="space-y-2">
                  {boards.map((board, i) => {
                    const playLabel = getPower655PlayTypeLabel(board.playType);
                    const boardColor = BOARD_COLORS[board.boardNo] ?? BOARD_COLORS.A;
                    return (
                      <div
                        key={i}
                        className="grid items-center gap-x-3 rounded-md border-l-[3px] py-2 pl-3"
                        style={{
                          borderLeftColor: boardColor,
                          gridTemplateColumns: "2rem 4rem 1fr",
                        }}
                      >
                        <div className="flex items-center justify-center self-stretch">
                          <span
                            className="text-sm font-extrabold leading-none"
                            style={{ color: boardColor }}
                          >
                            {board.boardNo}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-semibold leading-tight text-foreground">
                            {playLabel}
                          </span>
                          <span className="text-[10px] leading-tight text-muted-foreground">
                            {formatNumber(board.expandedLines)} lines
                          </span>
                          {board.betCount > 1 && (
                            <span className="text-[10px] leading-tight text-muted-foreground/70">
                              ×{board.betCount}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          {board.mainNumbers.map((n: string) => {
                            const isMatched = winningSet.has(n);
                            const isBonusMatch = !isScheduled && n === bonusNumber;
                            return (
                              <Ball
                                key={n}
                                n={n}
                                size="sm"
                                variant={isMatched ? "matched" : isBonusMatch ? "bonus" : "default"}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              boards.length > 0 && (
                <div className="rounded-lg border p-4">
                  <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Bộ số đã chọn
                  </p>
                  <div className="space-y-2">
                    {boards.map((board, i) => {
                      const playLabel = getPower655PlayTypeLabel(board.playType);
                      const boardColor = BOARD_COLORS[board.boardNo] ?? BOARD_COLORS.A;
                      return (
                        <div
                          key={i}
                          className="grid items-center gap-x-3 rounded-md border-l-[3px] py-2 pl-3"
                          style={{
                            borderLeftColor: boardColor,
                            gridTemplateColumns: "2rem 4rem 1fr",
                          }}
                        >
                          <div className="flex items-center justify-center self-stretch">
                            <span
                              className="text-sm font-extrabold leading-none"
                              style={{ color: boardColor }}
                            >
                              {board.boardNo}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[11px] font-semibold leading-tight text-foreground">
                              {playLabel}
                            </span>
                            <span className="text-[10px] leading-tight text-muted-foreground">
                              {formatNumber(board.expandedLines)} lines
                            </span>
                            {board.betCount > 1 && (
                              <span className="text-[10px] leading-tight text-muted-foreground/70">
                                ×{board.betCount}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            {board.mainNumbers.map((n: string) => (
                              <Ball key={n} n={n} size="sm" variant="default" />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            )}

            {/* ── 6. Giải trúng ─────────────────────────────────────────── */}
            {tiers.length > 0 && !isScheduled && (
              <div className="rounded-lg border border-profit/30 bg-profit/5 p-4">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-profit">
                  Giải trúng
                </p>
                <div className="space-y-2">
                  {sortedTiers.map((tier: EntryPayoutTier, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-md bg-background/60 px-3 py-1.5 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-medium">
                          {POWER655_PRIZE_TIER_LABELS[tier.tier] ?? tier.tier}
                        </Badge>
                        <span className="inline-flex items-center rounded-full bg-profit/15 px-2 py-0.5 text-[11px] font-bold tabular-nums text-profit">
                          ×{tier.hitCount} lần
                        </span>
                      </div>
                      <span className="tabular-nums font-bold text-profit">
                        {formatNumber(tier.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
