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
import {
  BINGO18_PLAY_TYPE_LABELS,
  BINGO18_BIG_SMALL_BET_LABELS,
  BINGO18_TRIPLE_KIND_LABELS,
} from "@megawin/game-bingo18/labels";
import { BINGO18_SIDE_BET_PLAY_TYPE_SET } from "@megawin/game-bingo18/entities";
import type {
  TicketEntryEntity,
  EntryBoardSnapshot,
  EntryBoardPayout,
} from "@megawin/game-bingo18/entities";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { EntryStatus } from "@megawin/game-core/entities";
import { boardColorVar } from "@/lib/game-colors";
import { Bingo18MatchDie } from "@/components/games/bingo18/dice-display";
import { EntryDetailDialogLoading } from "@/components/games/shared/skeletons/entry-detail-skeleton";

// ─── Entry Detail Dialog ──────────────────────────────────────────────────────

/**
 * Chi tiết 1 entry Bingo 18.
 *
 * Layout:
 * 1. Header: title + status icon + "ticketNo · drawId"
 * 2. Metadata strip (2 col): Người chơi · Lượt cược / Đại lý · Đặt lúc
 * 3. Financial KPI (2×2): Tiền cược · Trả thưởng / Hoa hồng ĐL · Lãi/lỗ
 * 4. Kết quả kỳ quay: 3 xúc xắc (tổng trong title)
 * 5. Danh sách boards — 3 cột, outcome dòng riêng
 */
export function Bingo18EntryDetailDialog({
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
      <DialogContent className="max-w-2xl">
        {entry ? (
          <Bingo18EntryDetailContent entry={entry} />
        ) : (
          <EntryDetailDialogLoading title="Phiếu cược — Bingo 18" />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Nội dung chi tiết thật — chỉ render khi `entry` đã fetch xong (xem `Bingo18EntryDetailDialog`). */
function Bingo18EntryDetailContent({ entry }: { entry: TicketEntryEntity }) {
  const payout = entry.payout as any;
  const allBoardPayouts: EntryBoardPayout[] = payout?.boardPayouts ?? [];
  // Map theo boardNo — dùng để tra payout của từng board
  const payoutByBoardNo = new Map(allBoardPayouts.map((bp) => [bp.boardNo, bp]));
  const allBoardSnapshots: EntryBoardSnapshot[] = entry.entrySummary?.boards ?? [];
  const betUnitCount = allBoardSnapshots.reduce((sum, b) => sum + (b.betCount ?? 1), 0);

  const payoutAmount: number = payout?.payoutAmount ?? 0;

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

  // Kết quả 3 xúc xắc — chỉ có sau settle/publish
  const drawNumbers: number[] = (entry as any).result?.numbers ?? [];
  const drawSum: number = (entry as any).result?.sum ?? 0;

  const winBoardCount = !isScheduled
    ? allBoardSnapshots.filter((s) => payoutByBoardNo.get(s.boardNo)?.isWin).length
    : 0;

  const accountId = (entry as any).accountId ?? "";
  const tenantUsername = toTenantUsername(entry.username ?? accountId);
  const playerLink = `/accounts/players/${accountId}`;
  const MAX_USERNAME_LEN = 14;
  const truncatedUsername =
    tenantUsername.length > MAX_USERNAME_LEN
      ? tenantUsername.slice(0, MAX_USERNAME_LEN) + "…"
      : tenantUsername;

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
          Phiếu cược — Bingo 18
        </DialogTitle>
        <DialogDescription className="flex items-center gap-1.5 font-mono text-xs">
          <Ticket className="size-3 shrink-0 text-muted-foreground" />
          {entry.entrySummary?.ticketNo || entry.id} · {entry.drawId}
        </DialogDescription>
      </DialogHeader>

      <ScrollArea className="max-h-[76vh]">
        <div className="space-y-4 pr-2">
          {/* ── 1. Metadata 2-column ──────────────────────────────────── */}
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

          {/* ── 2. Financial KPI strip ─────────────────────────────────── */}
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
                    {REPORT_COLUMN_LABELS.totalStake}
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

          {/* ── 3. Kết quả & Danh sách cược — gộp thành 1 card để so sánh trực quan */}
          {drawNumbers.length > 0 && !isScheduled && allBoardSnapshots.length > 0 ? (
            <div className="rounded-lg border p-4">
              {/* Kết quả 3 xúc xắc kỳ quay */}
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Kết quả
              </p>
              <div className="mb-4 flex flex-col items-center gap-3">
                <div className="flex items-center gap-4">
                  {drawNumbers.map((num, i) => (
                    <Bingo18MatchDie key={i} n={num} variant="result" size="lg" />
                  ))}
                </div>
                {drawSum > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-[12px] font-semibold tabular-nums text-muted-foreground">
                    Tổng
                    <span className="font-bold text-foreground">{drawSum}</span>
                  </span>
                )}
              </div>

              {/* Đường phân cách */}
              <div className="mb-3 border-t" />

              {/* Danh sách cược */}
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Danh sách cược
                {winBoardCount > 0 && (
                  <span className="ml-2 text-profit">
                    — {winBoardCount}/{allBoardSnapshots.length} trúng
                  </span>
                )}
              </p>
              <div className="space-y-2">
                {allBoardSnapshots.map((snapshot, i) => {
                  const boardColor = boardColorVar(snapshot.boardNo);
                  const bp = payoutByBoardNo.get(snapshot.boardNo);
                  const isSideBet = BINGO18_SIDE_BET_PLAY_TYPE_SET.has(snapshot.playType);
                  const boardIsWin = bp?.isWin ?? false;
                  const boardWinAmount = bp?.winAmount ?? 0;

                  let selectionContent: React.ReactNode;
                  if (snapshot.playType === "singleNum" || snapshot.playType === "doubleMatch") {
                    const num = snapshot.number;
                    const isMatchedInResult = num != null && drawNumbers.includes(num);
                    selectionContent =
                      num != null ? (
                        <Bingo18MatchDie
                          n={num}
                          size="sm"
                          variant={isMatchedInResult ? "matched" : "default"}
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      );
                  } else if (snapshot.playType === "tripleMatch") {
                    if (snapshot.tripleKind === "any") {
                      selectionContent = (
                        <span className="rounded bg-secondary px-2 py-0.5 text-xs font-medium">
                          {BINGO18_TRIPLE_KIND_LABELS["any"]}
                        </span>
                      );
                    } else {
                      const num = snapshot.number;
                      const allMatch = num != null && drawNumbers.every((d) => d === num);
                      selectionContent =
                        num != null ? (
                          <Bingo18MatchDie
                            n={num}
                            size="sm"
                            variant={allMatch ? "matched" : "default"}
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        );
                    }
                  } else if (snapshot.playType === "sumTotal") {
                    selectionContent = (
                      <span className="rounded bg-secondary px-2 py-0.5 text-xs font-medium tabular-nums">
                        Tổng {snapshot.sum}
                      </span>
                    );
                  } else if (snapshot.playType === "bigSmallDraw") {
                    const betLabel = snapshot.bet
                      ? (BINGO18_BIG_SMALL_BET_LABELS[
                          snapshot.bet as keyof typeof BINGO18_BIG_SMALL_BET_LABELS
                        ] ?? snapshot.bet)
                      : "—";
                    selectionContent = (
                      <span className="rounded bg-secondary px-2 py-0.5 text-xs font-semibold">
                        {betLabel}
                      </span>
                    );
                  } else {
                    selectionContent = <span className="text-muted-foreground">—</span>;
                  }

                  let outcomeContent: React.ReactNode = null;
                  if (bp) {
                    if (boardIsWin) {
                      outcomeContent = (
                        <div className="flex items-center justify-start gap-1.5">
                          {!isSideBet && bp.matchCount != null && bp.matchCount > 0 && (
                            <span className="inline-flex items-center rounded-full bg-profit/15 px-2 py-0.5 text-[11px] font-bold tabular-nums text-profit">
                              ×{bp.matchCount}
                            </span>
                          )}
                          <span className="text-sm font-bold tabular-nums text-profit">
                            +{formatNumber(boardWinAmount)}
                          </span>
                        </div>
                      );
                    } else {
                      outcomeContent = <span className="text-xs text-muted-foreground">—</span>;
                    }
                  }

                  return (
                    <div
                      key={i}
                      className="grid items-start gap-x-3 rounded-md border-l-[3px] py-2 pl-3"
                      style={{
                        borderLeftColor: boardColor,
                        gridTemplateColumns: "2rem 8rem 1fr",
                      }}
                    >
                      <div className="flex items-center justify-center self-stretch">
                        <span
                          className="text-sm font-extrabold leading-none"
                          style={{ color: boardColor }}
                        >
                          {snapshot.boardNo}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 pt-0.5">
                        <span className="text-[11px] font-semibold leading-tight text-foreground">
                          {BINGO18_PLAY_TYPE_LABELS[
                            snapshot.playType as keyof typeof BINGO18_PLAY_TYPE_LABELS
                          ] ?? snapshot.playType}
                        </span>
                        {snapshot.betCount > 1 && (
                          <span className="text-[10px] leading-tight text-muted-foreground">
                            ×{snapshot.betCount}
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
            allBoardSnapshots.length > 0 && (
              <div className="rounded-lg border p-4">
                <div className="mb-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Danh sách cược
                  </p>
                </div>
                <div className="space-y-2">
                  {allBoardSnapshots.map((snapshot, i) => {
                    const boardColor = boardColorVar(snapshot.boardNo);

                    let selectionContent: React.ReactNode;
                    if (snapshot.playType === "singleNum" || snapshot.playType === "doubleMatch") {
                      const num = snapshot.number;
                      selectionContent =
                        num != null ? (
                          <Bingo18MatchDie n={num} size="sm" variant="default" />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        );
                    } else if (snapshot.playType === "tripleMatch") {
                      if (snapshot.tripleKind === "any") {
                        selectionContent = (
                          <span className="rounded bg-secondary px-2 py-0.5 text-xs font-medium">
                            {BINGO18_TRIPLE_KIND_LABELS["any"]}
                          </span>
                        );
                      } else {
                        const num = snapshot.number;
                        selectionContent =
                          num != null ? (
                            <Bingo18MatchDie n={num} size="sm" variant="default" />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          );
                      }
                    } else if (snapshot.playType === "sumTotal") {
                      selectionContent = (
                        <span className="rounded bg-secondary px-2 py-0.5 text-xs font-medium tabular-nums">
                          Tổng {snapshot.sum}
                        </span>
                      );
                    } else if (snapshot.playType === "bigSmallDraw") {
                      const betLabel = snapshot.bet
                        ? (BINGO18_BIG_SMALL_BET_LABELS[
                            snapshot.bet as keyof typeof BINGO18_BIG_SMALL_BET_LABELS
                          ] ?? snapshot.bet)
                        : "—";
                      selectionContent = (
                        <span className="rounded bg-secondary px-2 py-0.5 text-xs font-semibold">
                          {betLabel}
                        </span>
                      );
                    } else {
                      selectionContent = <span className="text-muted-foreground">—</span>;
                    }

                    return (
                      <div
                        key={i}
                        className="grid items-start gap-x-3 rounded-md border-l-[3px] py-2 pl-3"
                        style={{
                          borderLeftColor: boardColor,
                          gridTemplateColumns: "2rem 8rem 1fr",
                        }}
                      >
                        <div className="flex items-center justify-center self-stretch">
                          <span
                            className="text-sm font-extrabold leading-none"
                            style={{ color: boardColor }}
                          >
                            {snapshot.boardNo}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 pt-0.5">
                          <span className="text-[11px] font-semibold leading-tight text-foreground">
                            {BINGO18_PLAY_TYPE_LABELS[
                              snapshot.playType as keyof typeof BINGO18_PLAY_TYPE_LABELS
                            ] ?? snapshot.playType}
                          </span>
                          {snapshot.betCount > 1 && (
                            <span className="text-[10px] leading-tight text-muted-foreground">
                              ×{snapshot.betCount}
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
    </>
  );
}
