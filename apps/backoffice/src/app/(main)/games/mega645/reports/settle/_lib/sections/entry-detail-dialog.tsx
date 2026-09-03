"use client";

import Link from "next/link";

import { EntryStatus } from "@megawin/game-core/entities";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import type { TicketEntryEntity } from "@megawin/game-mega645/entities";
import { PlayType, PrizeTier } from "@megawin/game-mega645/entities/enums";
import { MEGA645_PLAY_TYPE_LABELS, MEGA645_PRIZE_TIER_LABELS } from "@megawin/game-mega645/labels";
import { formatNumber, formatVN, toTenantUsername } from "@megawin/shared/utils";
import {
  Banknote,
  Building2,
  CheckCircle2,
  Clock,
  HandCoins,
  Layers,
  Minus,
  Ticket,
  Timer,
  TrendingDown,
  TrendingUp,
  User,
  XCircle,
} from "lucide-react";
import type { Route } from "next";

import { MegaMatchBall } from "@/components/games/mega645/mega-number-ball";
import { EntryDetailDialogLoading } from "@/components/games/shared/skeletons/entry-detail-skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { boardColorVar } from "@/lib/game-colors";

// ─── Prize Tier Order ─────────────────────────────────────────────────────────

/** Thứ tự hiển thị giải thưởng: Jackpot → Giải nhất → Giải nhì → Giải ba */
const MEGA645_PRIZE_TIER_ORDER: PrizeTier[] = [PrizeTier.Jackpot, PrizeTier.Tier1, PrizeTier.Tier2, PrizeTier.Tier3];

// ─── Entry Detail Dialog ──────────────────────────────────────────────────────

/**
 * Chi tiết 1 entry Mega 6/45.
 *
 * Layout:
 * 1. Header: title + icon trạng thái + "ticketNo · drawId"
 * 2. Metadata grid 2-column (Người chơi · Dòng cược / Đại lý · Đặt lúc)
 * 3. Financial KPI 2×2:
 *    - Outstanding: Tiền cược · Hoa hồng (2 ô)
 *    - Settled: Tiền cược · Trả thưởng / Hoa hồng · Lãi/lỗ (2×2)
 * 4. Kết quả kỳ quay (6 winning numbers — highlight chỉ số trùng board đã chọn)
 *    Mega 6/45 KHÔNG có bonus number.
 * 5. Bộ số đã chọn: boards A-F (6 số / board — highlight khi khớp)
 * 6. Giải trúng (chỉ khi có payout.tiers và không phải scheduled)
 */
export function Mega645EntryDetailDialog({
  entry,
  open,
  onClose,
}: {
  entry: TicketEntryEntity | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl">
        {entry ? (
          <Mega645EntryDetailContent entry={entry} />
        ) : (
          <EntryDetailDialogLoading title="Phiếu cược — Mega 6/45" />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Nội dung chi tiết thật — chỉ render khi `entry` đã fetch xong (xem `Mega645EntryDetailDialog`). */
function Mega645EntryDetailContent({ entry }: { entry: TicketEntryEntity }) {
  const tiers = entry.payout?.tiers ?? [];
  const boards = entry.entrySummary.boards ?? [];
  // scheduled = đang chờ kết quả — KHÔNG hiển thị payout, lãi/lỗ, kết quả

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

  // Mega 6/45: chỉ có winningNumbers, KHÔNG có bonusNumber
  const winningSet = new Set<string>(entry.result?.winningNumbers ?? []);

  const tenantUsername = toTenantUsername(entry.username);
  const playerLink = `/accounts/players/${entry.accountId}` as Route;
  const MAX_USERNAME_LEN = 14;
  const truncatedUsername =
    tenantUsername.length > MAX_USERNAME_LEN ? tenantUsername.slice(0, MAX_USERNAME_LEN) + "…" : tenantUsername;

  return (
    <>
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
          Phiếu cược — Mega 6/45
        </DialogTitle>
        <DialogDescription className="flex items-center gap-1.5 font-mono text-xs">
          <Ticket className="size-3 shrink-0 text-muted-foreground" />
          {entry.entrySummary.ticketNo} · {entry.drawId}
        </DialogDescription>
      </DialogHeader>

      <ScrollArea className="max-h-[76vh]">
        <div className="space-y-4 pr-2">
          {/* ── 1. Metadata 2-column ───────────────────────────────────── */}
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
                      <Link prefetch={false} href={playerLink} className="cursor-pointer font-semibold hover:underline">
                        {truncatedUsername}
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="font-mono text-xs">{tenantUsername}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Link prefetch={false} href={playerLink} className="font-semibold hover:underline">
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
              <span className="font-semibold">{entry.tenantId ?? "—"}</span>
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

          {/* ── 3. Financial KPI strip ─────────────────────────────────── */}
          {isScheduled ? (
            /* Outstanding mode: Tiền cược · Hoa hồng ĐL */
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
                  <p className="text-[11px] text-muted-foreground">{REPORT_COLUMN_LABELS.totalCommission}</p>
                  <p className="text-sm font-bold tabular-nums">{formatNumber(entry.tenant.commissionAmount)}</p>
                </div>
              </div>
            </div>
          ) : (
            /* Settled mode: 2×2 grid — Tiền cược · Trả thưởng / Hoa hồng ĐL · Lãi/lỗ */
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
                  <p className="text-[11px] text-muted-foreground">{REPORT_COLUMN_LABELS.totalPayout}</p>
                  <p className="text-sm font-bold tabular-nums">{formatNumber(entry.payout?.payoutAmount ?? 0)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900/50">
                  <HandCoins className="size-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">{REPORT_COLUMN_LABELS.totalCommission}</p>
                  <p className="text-sm font-bold tabular-nums">{formatNumber(entry.tenant.commissionAmount)}</p>
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
                    <p className="text-[11px] text-muted-foreground">{REPORT_COLUMN_LABELS.playerNetProfit}</p>
                    <p
                      className={`text-sm font-bold tabular-nums ${
                        playerNet > 0 ? "text-profit" : playerNet < 0 ? "text-loss" : "text-foreground"
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

          {/* ── 4. Kết quả & Bộ số đã chọn — gộp thành 1 card để so sánh trực quan */}
          {entry.result && !isScheduled && boards.length > 0 ? (
            <div className="rounded-lg border p-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Kết quả</p>
              <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
                {entry.result.winningNumbers.map((n: string) => {
                  const playerPicked = boards.some((b) => b.numbers.includes(n));
                  return <MegaMatchBall key={n} n={n} variant={playerPicked ? "matched" : "result"} />;
                })}
              </div>

              <div className="mb-3 border-t" />

              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Bộ số đã chọn
              </p>
              <div className="space-y-2.5">
                {boards.map((board, i) => {
                  const playLabel = MEGA645_PLAY_TYPE_LABELS[board.playType as PlayType] ?? board.playType;
                  const isStandard = board.playType === PlayType.Standard;
                  const boardColor = boardColorVar(board.boardNo);
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
                        <span className="text-sm font-extrabold leading-none" style={{ color: boardColor }}>
                          {board.boardNo}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-semibold leading-tight text-foreground">
                          {isStandard ? "Thường" : playLabel}
                        </span>
                        <span className="text-[10px] leading-tight text-muted-foreground">
                          {board.expandedLines > 1 ? `${formatNumber(board.expandedLines)} lines` : "1 line"}
                        </span>
                        {board.betCount > 1 && (
                          <span className="text-[10px] leading-tight text-muted-foreground/70">×{board.betCount}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {board.numbers.map((n: string) => (
                          <MegaMatchBall key={n} n={n} size="sm" variant={winningSet.has(n) ? "matched" : "default"} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Fallback: chỉ hiển thị board nếu chưa có kết quả (scheduled) */
            boards.length > 0 && (
              <div className="rounded-lg border p-4">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Bộ số đã chọn
                </p>
                <div className="space-y-2.5">
                  {boards.map((board, i) => {
                    const playLabel = MEGA645_PLAY_TYPE_LABELS[board.playType as PlayType] ?? board.playType;
                    const isStandard = board.playType === PlayType.Standard;
                    const boardColor = boardColorVar(board.boardNo);
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
                          <span className="text-sm font-extrabold leading-none" style={{ color: boardColor }}>
                            {board.boardNo}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-semibold leading-tight text-foreground">
                            {isStandard ? "Thường" : playLabel}
                          </span>
                          <span className="text-[10px] leading-tight text-muted-foreground">
                            {board.expandedLines > 1 ? `${formatNumber(board.expandedLines)} lines` : "1 line"}
                          </span>
                          {board.betCount > 1 && (
                            <span className="text-[10px] leading-tight text-muted-foreground/70">
                              ×{board.betCount}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          {board.numbers.map((n: string) => (
                            <MegaMatchBall key={n} n={n} size="sm" variant="default" />
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
              <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-profit">Giải trúng</p>
              <div className="space-y-2">
                {[...tiers]
                  .sort(
                    (a, b) =>
                      MEGA645_PRIZE_TIER_ORDER.indexOf(a.tier as PrizeTier) -
                      MEGA645_PRIZE_TIER_ORDER.indexOf(b.tier as PrizeTier),
                  )
                  .map((tier, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-md bg-background/60 px-3 py-1.5 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-medium">
                          {MEGA645_PRIZE_TIER_LABELS[tier.tier as PrizeTier] ?? tier.tier}
                        </Badge>
                        <span className="inline-flex items-center rounded-full bg-profit/15 px-2 py-0.5 text-[11px] font-bold tabular-nums text-profit">
                          ×{tier.hitCount} lần
                        </span>
                      </div>
                      <span className="tabular-nums font-bold text-profit">{formatNumber(tier.amount)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  );
}
