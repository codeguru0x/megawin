"use client";

import Link from "next/link";
import {
  Ticket,
  Building2,
  User,
  Clock,
  Banknote,
  HandCoins,
  TrendingUp,
  TrendingDown,
  Minus,
  Hash,
  CheckCircle2,
  XCircle,
  Timer,
} from "lucide-react";
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
import { KENO_SIDE_BET_PLAY_TYPE_SET } from "@megawin/game-keno/entities";
import type {
  TicketEntryEntity,
  EntryBoardSnapshot,
  EntryBoardPayout,
} from "@megawin/game-keno/entities";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { EntryStatus } from "@megawin/game-core/entities";
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

// ─── Board Color Map ──────────────────────────────────────────────────────────

const BOARD_COLORS: Record<string, string> = {
  A: "var(--board-a)",
  B: "var(--board-b)",
  C: "var(--board-c)",
};

// ─── Ball helper ──────────────────────────────────────────────────────────────

function Ball({
  n,
  variant = "default",
}: {
  n: string;
  variant?: "default" | "matched" | "result" | "result-picked";
}) {
  const cls =
    variant === "matched"
      ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
      : variant === "result-picked"
        ? "bg-primary text-primary-foreground"
        : variant === "result"
          ? "bg-muted/80 text-muted-foreground"
          : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex size-7 items-center justify-center rounded-full text-[11px] font-bold tabular-nums ${cls}`}
    >
      {n}
    </span>
  );
}

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
  if (!entry) return null;

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
  const playerLink = `/accounts/players/${entry.accountId}`;
  const MAX_LEN = 14;
  const displayUsername =
    tenantUsername.length > MAX_LEN ? tenantUsername.slice(0, MAX_LEN) + "…" : tenantUsername;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
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
            Phiếu cược — Keno
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 font-mono text-xs">
            <Ticket className="size-3 shrink-0 text-muted-foreground" />
            {entry.entrySummary?.ticketNo ?? entry.id} · {entry.drawId}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[76vh]">
          <div className="space-y-4 pr-2">
            {/* ── 1. Metadata strip (gộp trạng thái) ──────────────── */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 rounded-lg bg-muted/50 px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <User className="size-3.5 shrink-0" />
                  Người chơi
                </span>
                {tenantUsername.length > MAX_LEN ? (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href={playerLink}
                          className="cursor-pointer font-semibold hover:underline"
                        >
                          {displayUsername}
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
                  <Hash className="size-3.5 shrink-0" />
                  Lượt cược
                </span>
                <span className="font-semibold tabular-nums">{betUnitCount}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Building2 className="size-3.5 shrink-0" />
                  Đại lý
                </span>
                <span className="font-semibold">{entry.tenantId}</span>
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

            {/* ── 2. Financial KPI — 2×2 grid ─────────────────────── */}
            {isScheduled ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-900/50">
                    <Banknote className="size-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      Tiền cược
                      {betUnitCount > 1 && (
                        <span className="rounded bg-muted px-1 py-px text-[10px] font-medium text-muted-foreground">
                          ×{formatNumber(betUnitCount)}
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
                    <p className="text-[11px] text-muted-foreground">Hoa hồng ĐL</p>
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
                      {betUnitCount > 1 && (
                        <span className="rounded bg-muted px-1 py-px text-[10px] font-medium text-muted-foreground">
                          ×{formatNumber(betUnitCount)}
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
                    <p className="text-[11px] text-muted-foreground">Trả thưởng</p>
                    <p className="text-sm font-bold tabular-nums">{formatNumber(payoutAmount)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900/50">
                    <HandCoins className="size-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Hoa hồng ĐL</p>
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

            {/* ── 3. Kết quả 20 số & Danh sách cược — gộp thành 1 card để so sánh trực quan */}
            {winningSet.size > 0 && !isScheduled && boards.length > 0 ? (
              <div className="rounded-lg border p-4">
                {/* Kết quả 20 số kỳ quay */}
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Kết quả
                </p>
                <div className="mb-4 flex flex-wrap justify-center gap-1.5">
                  {[...winningSet]
                    .sort((a, b) => Number(a) - Number(b))
                    .map((num) => (
                      <Ball
                        key={num}
                        n={num}
                        variant={playerPickedNums.has(num) ? "result-picked" : "result"}
                      />
                    ))}
                </div>

                {/* Đường phân cách */}
                <div className="mb-3 border-t" />

                {/* Danh sách cược */}
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Danh sách cược
                  {winBoardCount > 0 && (
                    <span className="ml-2 text-profit">
                      — {winBoardCount}/{boards.length} trúng
                    </span>
                  )}
                </p>
                <div className="space-y-2">
                  {boards.map((board) => {
                    const boardColor = BOARD_COLORS[board.boardNo] ?? BOARD_COLORS.A;
                    const payout = boardPayoutsMap.get(board.boardNo + board.playType);
                    const isSideBet = KENO_SIDE_BET_PLAY_TYPE_SET.has(board.playType);
                    const pickLabel = KENO_PLAY_TYPE_LABELS[board.playType] ?? board.playType;
                    const boardWin = payout?.isWin && !isScheduled;

                    let selectionContent: React.ReactNode;
                    if (isSideBet) {
                      const betLabel = board.bet ? (KENO_BET_LABELS[board.bet] ?? board.bet) : "—";
                      selectionContent = (
                        <span className="rounded bg-secondary px-2 py-0.5 text-xs font-semibold">
                          {betLabel}
                        </span>
                      );
                    } else {
                      const nums: string[] = board.numbers ?? [];
                      selectionContent = (
                        <div className="flex flex-wrap gap-1">
                          {nums.map((n) => (
                            <Ball
                              key={n}
                              n={n}
                              variant={winningSet.has(n) ? "matched" : "default"}
                            />
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
                              <span className="inline-flex items-center rounded-full bg-profit/15 px-2 py-0.5 text-[11px] font-bold tabular-nums text-profit">
                                {payout.matchCount ?? 0}/{payout.pickCount ?? 0}
                              </span>
                            )}
                            <span className="text-sm font-bold text-profit tabular-nums">
                              +{formatNumber(payout.winAmount)}
                            </span>
                          </div>
                        );
                      } else {
                        outcomeContent = isSideBet ? (
                          <div className="flex items-center justify-start">
                            <span className="text-xs text-muted-foreground">—</span>
                          </div>
                        ) : null;
                      }
                    }

                    return (
                      <div
                        key={board.boardNo + board.playType}
                        className="grid items-start gap-x-3 rounded-md border-l-[3px] py-2 pl-3"
                        style={{
                          borderLeftColor: boardColor,
                          gridTemplateColumns: "2rem 5.5rem 1fr",
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
                        <div className="flex flex-col gap-0.5 pt-0.5">
                          <span className="text-[11px] font-semibold leading-tight text-foreground">
                            {pickLabel}
                          </span>
                          {board.betCount > 1 && (
                            <span className="text-[10px] leading-tight text-muted-foreground">
                              ×{board.betCount}
                            </span>
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
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Danh sách cược
                    </p>
                  </div>
                  <div className="space-y-2">
                    {boards.map((board) => {
                      const boardColor = BOARD_COLORS[board.boardNo] ?? BOARD_COLORS.A;
                      const isSideBet = KENO_SIDE_BET_PLAY_TYPE_SET.has(board.playType);
                      const pickLabel = KENO_PLAY_TYPE_LABELS[board.playType] ?? board.playType;

                      let selectionContent: React.ReactNode;
                      if (isSideBet) {
                        const betLabel = board.bet
                          ? (KENO_BET_LABELS[board.bet] ?? board.bet)
                          : "—";
                        selectionContent = (
                          <span className="rounded bg-secondary px-2 py-0.5 text-xs font-semibold">
                            {betLabel}
                          </span>
                        );
                      } else {
                        const nums: string[] = board.numbers ?? [];
                        selectionContent = (
                          <div className="flex flex-wrap gap-1">
                            {nums.map((n) => (
                              <Ball key={n} n={n} variant="default" />
                            ))}
                          </div>
                        );
                      }

                      return (
                        <div
                          key={board.boardNo + board.playType}
                          className="grid items-start gap-x-3 rounded-md border-l-[3px] py-2 pl-3"
                          style={{
                            borderLeftColor: boardColor,
                            gridTemplateColumns: "2rem 5.5rem 1fr",
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
                          <div className="flex flex-col gap-0.5 pt-0.5">
                            <span className="text-[11px] font-semibold leading-tight text-foreground">
                              {pickLabel}
                            </span>
                            {board.betCount > 1 && (
                              <span className="text-[10px] leading-tight text-muted-foreground">
                                ×{board.betCount}
                              </span>
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
      </DialogContent>
    </Dialog>
  );
}
