"use client";

import type { CSSProperties } from "react";

import Link from "next/link";

import { EntryStatus } from "@megawin/game-core/entities";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import {
  KENO_SIDE_BET_PLAY_TYPE_SET,
  type EntryBoardPayout,
  type EntryBoardSnapshot,
  type TicketEntryEntity,
} from "@megawin/game-keno/entities";
import { formatNumber, formatVN, toTenantUsername } from "@megawin/shared/utils";
import {
  Banknote,
  Building2,
  CheckCircle2,
  Clock,
  HandCoins,
  Hash,
  Minus,
  Ticket,
  Timer,
  TrendingDown,
  TrendingUp,
  User,
  XCircle,
} from "lucide-react";
import type { Route } from "next";

import { KenoMatchBall } from "@/components/games/keno/keno-number-ball";
import { EntryDetailDialogLoading } from "@/components/games/shared/skeletons/entry-detail-skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { boardColorVar } from "@/lib/game-colors";

// ─── Keno Play Type Labels ─────────────────────────────────────────────────────

const KENO_PLAY_TYPE_LABELS: Record<string, string> = {
  pick1: "Pick 1",
  pick2: "Pick 2",
  pick3: "Pick 3",
  pick4: "Pick 4",
  pick5: "Pick 5",
  pick6: "Pick 6",
  pick7: "Pick 7",
  pick8: "Pick 8",
  pick9: "Pick 9",
  pick10: "Pick 10",
  bigSmall: "Lớn/Nhỏ",
  evenOdd: "Chẵn/Lẻ",
};

const KENO_BET_LABELS: Record<string, string> = {
  big: "Lớn",
  small: "Nhỏ",
  bigSmallDraw: "Hoà",
  even: "Chẵn",
  odd: "Lẻ",
  even1112: "Chẵn 11-12",
  odd1112: "Lẻ 11-12",
  evenOddDraw: "Hoà Chẵn/Lẻ",
};

// ─── Entry Detail Dialog ──────────────────────────────────────────────────────

/** Chi tiết 1 entry Keno — unified boards (pick + side bets), kết quả 20 số. */
export function KenoEntryDetailDialog({
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
      <DialogContent className="max-w-3xl">
        {entry ? <KenoEntryDetailContent entry={entry} /> : <EntryDetailDialogLoading title="Phiếu cược — Keno" />}
      </DialogContent>
    </Dialog>
  );
}

/** Nội dung chi tiết thật — chỉ render khi `entry` đã fetch xong (xem `KenoEntryDetailDialog`). */
function KenoEntryDetailContent({ entry }: { entry: TicketEntryEntity }) {
  const boards: EntryBoardSnapshot[] = entry.entrySummary?.boards ?? [];
  const betUnitCount = boards.reduce((sum, b) => sum + (b.betCount ?? 1), 0);

  // Payout data — chỉ có sau khi settle
  const boardPayoutsMap = new Map<string, EntryBoardPayout>(
    (entry.payout?.boardPayouts ?? []).map((p: EntryBoardPayout) => [p.boardNo + p.playType, p]),
  );
  const payoutAmount: number = entry.payout?.payoutAmount ?? 0;
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

  // 20 số kết quả kỳ quay — chỉ có sau settle/publish
  const winningSet = new Set<string>(entry.result?.winningNumbers ?? []);

  // Tập hợp tất cả số player đã chọn (dùng highlight trên kết quả kỳ quay)
  const playerPickedNums = new Set<string>(boards.flatMap((b) => b.numbers ?? []));

  // Đếm số boards trúng (chỉ sau settle)
  const winBoardCount = !isScheduled
    ? boards.filter((b) => boardPayoutsMap.get(b.boardNo + b.playType)?.isWin).length
    : 0;

  const tenantUsername = toTenantUsername(entry.username);
  const playerLink = `/accounts/players/${entry.accountId}` as Route;
  const MAX_LEN = 14;
  const displayUsername = tenantUsername.length > MAX_LEN ? tenantUsername.slice(0, MAX_LEN) + "…" : tenantUsername;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2.5 text-base">
          {isSettled ? (
            <span className="inline-flex items-center justify-center rounded-full bg-emerald-500/15 p-1">
              <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
            </span>
          ) : isVoid ? (
            <span className="bg-destructive/15 inline-flex items-center justify-center rounded-full p-1">
              <XCircle className="text-destructive size-5 shrink-0" />
            </span>
          ) : (
            <span className="inline-flex items-center justify-center rounded-full bg-amber-500/15 p-1">
              <Timer className="size-5 shrink-0 text-amber-500" />
            </span>
          )}
          Phiếu cược — Keno
        </DialogTitle>
        <DialogDescription className="flex items-center gap-1.5 font-mono text-xs">
          <Ticket className="text-muted-foreground size-3 shrink-0" />
          {entry.entrySummary?.ticketNo ?? entry.id} · {entry.drawId}
        </DialogDescription>
      </DialogHeader>

      <ScrollArea className="max-h-[76vh]">
        <div className="space-y-4 pr-2">
          {/* ── 1. Metadata strip (gộp trạng thái) ──────────────── */}
          <div className="bg-muted/50 grid grid-cols-2 gap-x-8 gap-y-1.5 rounded-lg px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
                <User className="size-3.5 shrink-0" />
                Người chơi
              </span>
              {tenantUsername.length > MAX_LEN ? (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link prefetch={false} href={playerLink} className="cursor-pointer font-semibold hover:underline">
                        {displayUsername}
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
              <span className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
                <Hash className="size-3.5 shrink-0" />
                Lượt cược
              </span>
              <span className="font-semibold tabular-nums">{betUnitCount}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
                <Building2 className="size-3.5 shrink-0" />
                Đại lý
              </span>
              <span className="font-semibold">{entry.tenantId}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
                <Clock className="size-3.5 shrink-0" />
                Đặt lúc
              </span>
              <span className="font-semibold tabular-nums">
                {formatVN(new Date(entry.createdAt as unknown as string), "HH:mm dd/MM")}
              </span>
            </div>
          </div>

          {/* ── 2. Financial KPI — 2×2 grid ─────────────────────── */}
          {isScheduled ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted/50 flex items-center gap-3 rounded-lg p-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-900/50">
                  <Banknote className="size-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
                    Tiền cược
                    {betUnitCount > 1 && (
                      <span className="bg-muted text-muted-foreground rounded px-1 py-px text-[10px] font-medium">
                        ×{formatNumber(betUnitCount)}
                      </span>
                    )}
                  </p>
                  <p className="text-sm font-bold tabular-nums">{formatNumber(entry.amount)}</p>
                </div>
              </div>
              <div className="bg-muted/50 flex items-center gap-3 rounded-lg p-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900/50">
                  <HandCoins className="size-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px]">Hoa hồng ĐL</p>
                  <p className="text-sm font-bold tabular-nums">{formatNumber(entry.tenant.commissionAmount)}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted/50 flex items-center gap-3 rounded-lg p-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-900/50">
                  <Banknote className="size-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
                    Tiền cược
                    {betUnitCount > 1 && (
                      <span className="bg-muted text-muted-foreground rounded px-1 py-px text-[10px] font-medium">
                        ×{formatNumber(betUnitCount)}
                      </span>
                    )}
                  </p>
                  <p className="text-sm font-bold tabular-nums">{formatNumber(entry.amount)}</p>
                </div>
              </div>
              <div className="bg-muted/50 flex items-center gap-3 rounded-lg p-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-900/50">
                  <Banknote className="size-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px]">Trả thưởng</p>
                  <p className="text-sm font-bold tabular-nums">{formatNumber(payoutAmount)}</p>
                </div>
              </div>
              <div className="bg-muted/50 flex items-center gap-3 rounded-lg p-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900/50">
                  <HandCoins className="size-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px]">Hoa hồng ĐL</p>
                  <p className="text-sm font-bold tabular-nums">{formatNumber(entry.tenant.commissionAmount)}</p>
                </div>
              </div>
              {playerNet !== null && (
                <div className="bg-muted/50 flex items-center gap-3 rounded-lg p-3">
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
                      <Minus className="text-muted-foreground size-4" />
                    )}
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[11px]">{REPORT_COLUMN_LABELS.playerNetProfit}</p>
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

          {/* ── 3. Kết quả 20 số & Danh sách cược — gộp thành 1 card để so sánh trực quan */}
          {winningSet.size > 0 && !isScheduled && boards.length > 0 ? (
            <div className="rounded-lg border p-4">
              {/* Kết quả 20 số kỳ quay */}
              <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">Kết quả</p>
              <div className="mb-4 flex flex-wrap justify-center gap-1.5">
                {[...winningSet]
                  .sort((a, b) => Number(a) - Number(b))
                  .map((num) => (
                    <KenoMatchBall key={num} n={num} variant={playerPickedNums.has(num) ? "result-picked" : "result"} />
                  ))}
              </div>

              {/* Đường phân cách */}
              <div className="mb-3 border-t" />

              {/* Danh sách cược */}
              <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
                Danh sách cược
                {winBoardCount > 0 && (
                  <span className="text-profit ml-2">
                    — {winBoardCount}/{boards.length} trúng
                  </span>
                )}
              </p>
              <div className="space-y-2">
                {boards.map((board) => {
                  const boardColor = boardColorVar(board.boardNo);
                  const payout = boardPayoutsMap.get(board.boardNo + board.playType);
                  const isSideBet = KENO_SIDE_BET_PLAY_TYPE_SET.has(board.playType);
                  const pickLabel = KENO_PLAY_TYPE_LABELS[board.playType] ?? board.playType;
                  const boardWin = payout?.isWin && !isScheduled;

                  let selectionContent: React.ReactNode;
                  if (isSideBet) {
                    const betLabel = board.bet ? (KENO_BET_LABELS[board.bet] ?? board.bet) : "—";
                    selectionContent = (
                      <span className="bg-secondary rounded px-2 py-0.5 text-xs font-semibold">{betLabel}</span>
                    );
                  } else {
                    const nums: string[] = board.numbers ?? [];
                    selectionContent = (
                      <div className="flex flex-wrap gap-1">
                        {nums.map((n) => (
                          <KenoMatchBall key={n} n={n} variant={winningSet.has(n) ? "matched" : "default"} />
                        ))}
                      </div>
                    );
                  }

                  let outcomeContent: React.ReactNode = null;
                  if (payout) {
                    if (boardWin) {
                      outcomeContent = (
                        <div className="flex items-center justify-start gap-1.5">
                          {!isSideBet && (
                            <span className="bg-profit/15 text-profit inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums">
                              {payout.matchCount ?? 0}/{payout.pickCount ?? 0}
                            </span>
                          )}
                          <span className="text-profit text-sm font-bold tabular-nums">
                            +{formatNumber(payout.winAmount)}
                          </span>
                        </div>
                      );
                    } else {
                      outcomeContent = isSideBet ? (
                        <div className="flex items-center justify-start">
                          <span className="text-muted-foreground text-xs">—</span>
                        </div>
                      ) : null;
                    }
                  }

                  return (
                    <div
                      key={board.boardNo + board.playType}
                      className="grid [grid-template-columns:2rem_5.5rem_1fr] items-start gap-x-3 rounded-md border-l-[3px] border-l-[var(--board-color)] py-2 pl-3"
                      style={{ "--board-color": boardColor } as CSSProperties}
                    >
                      <div className="flex items-center justify-center self-stretch">
                        <span className="text-sm leading-none font-extrabold text-[var(--board-color)]">
                          {board.boardNo}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 pt-0.5">
                        <span className="text-foreground text-[11px] leading-tight font-semibold">{pickLabel}</span>
                        {board.betCount > 1 && (
                          <span className="text-muted-foreground text-[10px] leading-tight">×{board.betCount}</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <div>{selectionContent}</div>
                        {outcomeContent && <div>{outcomeContent}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Fallback: chỉ hiển thị danh sách cược nếu chưa có kết quả (scheduled) */
            boards.length > 0 && (
              <div className="rounded-lg border p-4">
                <div className="mb-3">
                  <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                    Danh sách cược
                  </p>
                </div>
                <div className="space-y-2">
                  {boards.map((board) => {
                    const boardColor = boardColorVar(board.boardNo);
                    const isSideBet = KENO_SIDE_BET_PLAY_TYPE_SET.has(board.playType);
                    const pickLabel = KENO_PLAY_TYPE_LABELS[board.playType] ?? board.playType;

                    let selectionContent: React.ReactNode;
                    if (isSideBet) {
                      const betLabel = board.bet ? (KENO_BET_LABELS[board.bet] ?? board.bet) : "—";
                      selectionContent = (
                        <span className="bg-secondary rounded px-2 py-0.5 text-xs font-semibold">{betLabel}</span>
                      );
                    } else {
                      const nums: string[] = board.numbers ?? [];
                      selectionContent = (
                        <div className="flex flex-wrap gap-1">
                          {nums.map((n) => (
                            <KenoMatchBall key={n} n={n} variant="default" />
                          ))}
                        </div>
                      );
                    }

                    return (
                      <div
                        key={board.boardNo + board.playType}
                        className="grid [grid-template-columns:2rem_5.5rem_1fr] items-start gap-x-3 rounded-md border-l-[3px] border-l-[var(--board-color)] py-2 pl-3"
                        style={{ "--board-color": boardColor } as CSSProperties}
                      >
                        <div className="flex items-center justify-center self-stretch">
                          <span className="text-sm leading-none font-extrabold text-[var(--board-color)]">
                            {board.boardNo}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 pt-0.5">
                          <span className="text-foreground text-[11px] leading-tight font-semibold">{pickLabel}</span>
                          {board.betCount > 1 && (
                            <span className="text-muted-foreground text-[10px] leading-tight">×{board.betCount}</span>
                          )}
                        </div>
                        <div>{selectionContent}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}
        </div>
      </ScrollArea>
    </>
  );
}
