"use client";

import Link from "next/link";

import {
  BINGO18_SIDE_BET_PLAY_TYPE_SET,
  type EntryBoardPayout,
  type EntryBoardSnapshot,
  type TicketEntryEntity,
} from "@megawin/game-bingo18/entities";
import {
  BINGO18_BIG_SMALL_BET_LABELS,
  BINGO18_PLAY_TYPE_LABELS,
  BINGO18_TRIPLE_KIND_LABELS,
} from "@megawin/game-bingo18/labels";
import { EntryStatus } from "@megawin/game-core/entities";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
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

import { Bingo18MatchDie } from "@/components/games/bingo18/dice-display";
import { EntryDetailDialogLoading } from "@/components/games/shared/skeletons/entry-detail-skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { boardColorVar } from "@/lib/game-colors";

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
  const playerLink = `/accounts/players/${accountId}` as Route;
  const MAX_USERNAME_LEN = 14;
  const truncatedUsername =
    tenantUsername.length > MAX_USERNAME_LEN ? tenantUsername.slice(0, MAX_USERNAME_LEN) + "…" : tenantUsername;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2.5 text-base">
          {isSettled ? (
            <span className="bg-profit/15 inline-flex items-center justify-center rounded-full p-1">
              <CheckCircle2 className="text-profit size-5 shrink-0" />
            </span>
          ) : isVoid ? (
            <span className="bg-destructive/15 inline-flex items-center justify-center rounded-full p-1">
              <XCircle className="text-destructive size-5 shrink-0" />
            </span>
          ) : (
            <span className="bg-warning/15 inline-flex items-center justify-center rounded-full p-1">
              <Timer className="text-warning size-5 shrink-0" />
            </span>
          )}
          Phiếu cược — Bingo 18
        </DialogTitle>
        <DialogDescription className="flex items-center gap-1.5 font-mono text-xs">
          <Ticket className="text-muted-foreground size-3 shrink-0" />
          {entry.entrySummary?.ticketNo || entry.id} · {entry.drawId}
        </DialogDescription>
      </DialogHeader>

      <ScrollArea className="max-h-[76vh]">
        <div className="space-y-4 pr-2">
          {/* ── 1. Metadata 2-column ──────────────────────────────────── */}
          <div className="bg-muted/50 grid grid-cols-2 gap-x-8 gap-y-1.5 rounded-lg px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
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
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Hash className="size-3.5 shrink-0" />
                Lượt cược
              </span>
              <span className="font-semibold tabular-nums">{betUnitCount}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Building2 className="size-3.5 shrink-0" />
                Đại lý
              </span>
              <span className="font-semibold">{(entry as any).tenantId ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
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
              <div className="bg-muted/50 flex items-center gap-3 rounded-lg p-3">
                <div className="bg-profit flex size-8 shrink-0 items-center justify-center rounded-md">
                  <Banknote className="text-profit size-4" />
                </div>
                <div>
                  <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    Tiền cược
                    {betUnitCount > 1 && (
                      <span className="bg-muted text-muted-foreground rounded px-1 py-px text-xs font-medium">
                        ×{formatNumber(betUnitCount)}
                      </span>
                    )}
                  </p>
                  <p className="text-sm font-bold tabular-nums">{formatNumber(entry.amount)}</p>
                </div>
              </div>
              <div className="bg-muted/50 flex items-center gap-3 rounded-lg p-3">
                <div className="bg-warning flex size-8 shrink-0 items-center justify-center rounded-md">
                  <HandCoins className="text-warning size-4" />
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Hoa hồng ĐL</p>
                  <p className="text-sm font-bold tabular-nums">{formatNumber(entry.tenant.commissionAmount)}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted/50 flex items-center gap-3 rounded-lg p-3">
                <div className="bg-profit flex size-8 shrink-0 items-center justify-center rounded-md">
                  <Banknote className="text-profit size-4" />
                </div>
                <div>
                  <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    {REPORT_COLUMN_LABELS.totalStake}
                    {betUnitCount > 1 && (
                      <span className="bg-muted text-muted-foreground rounded px-1 py-px text-xs font-medium">
                        ×{formatNumber(betUnitCount)}
                      </span>
                    )}
                  </p>
                  <p className="text-sm font-bold tabular-nums">{formatNumber(entry.amount)}</p>
                </div>
              </div>
              <div className="bg-muted/50 flex items-center gap-3 rounded-lg p-3">
                <div className="bg-info flex size-8 shrink-0 items-center justify-center rounded-md">
                  <Banknote className="text-info size-4" />
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Trả thưởng</p>
                  <p className="text-sm font-bold tabular-nums">{formatNumber(payoutAmount)}</p>
                </div>
              </div>
              <div className="bg-muted/50 flex items-center gap-3 rounded-lg p-3">
                <div className="bg-warning flex size-8 shrink-0 items-center justify-center rounded-md">
                  <HandCoins className="text-warning size-4" />
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Hoa hồng ĐL</p>
                  <p className="text-sm font-bold tabular-nums">{formatNumber(entry.tenant.commissionAmount)}</p>
                </div>
              </div>
              {playerNet !== null && (
                <div className="bg-muted/50 flex items-center gap-3 rounded-lg p-3">
                  <div
                    className={`flex size-8 shrink-0 items-center justify-center rounded-md ${
                      playerNet > 0 ? "bg-profit" : playerNet < 0 ? "bg-loss" : "bg-muted"
                    }`}
                  >
                    {playerNet > 0 ? (
                      <TrendingUp className="text-profit size-4" />
                    ) : playerNet < 0 ? (
                      <TrendingDown className="text-loss size-4" />
                    ) : (
                      <Minus className="text-muted-foreground size-4" />
                    )}
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">{REPORT_COLUMN_LABELS.playerNetProfit}</p>
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

          {/* ── 3. Kết quả & Danh sách cược — gộp thành 1 card để so sánh trực quan */}
          {drawNumbers.length > 0 && !isScheduled && allBoardSnapshots.length > 0 ? (
            <div className="rounded-lg border p-4">
              {/* Kết quả 3 xúc xắc kỳ quay */}
              <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">Kết quả</p>
              <div className="mb-4 flex flex-col items-center gap-3">
                <div className="flex items-center gap-4">
                  {drawNumbers.map((num, i) => (
                    <Bingo18MatchDie key={i} n={num} variant="result" size="lg" />
                  ))}
                </div>
                {drawSum > 0 && (
                  <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold tabular-nums">
                    Tổng
                    <span className="text-foreground font-bold">{drawSum}</span>
                  </span>
                )}
              </div>

              {/* Đường phân cách */}
              <div className="mb-3 border-t" />

              {/* Danh sách cược */}
              <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                Danh sách cược
                {winBoardCount > 0 && (
                  <span className="text-profit ml-2">
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
                        <Bingo18MatchDie n={num} size="sm" variant={isMatchedInResult ? "matched" : "default"} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      );
                  } else if (snapshot.playType === "tripleMatch") {
                    if (snapshot.tripleKind === "any") {
                      selectionContent = (
                        <span className="bg-secondary rounded px-2 py-0.5 text-xs font-medium">
                          {BINGO18_TRIPLE_KIND_LABELS["any"]}
                        </span>
                      );
                    } else {
                      const num = snapshot.number;
                      const allMatch = num != null && drawNumbers.every((d) => d === num);
                      selectionContent =
                        num != null ? (
                          <Bingo18MatchDie n={num} size="sm" variant={allMatch ? "matched" : "default"} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        );
                    }
                  } else if (snapshot.playType === "sumTotal") {
                    selectionContent = (
                      <span className="bg-secondary rounded px-2 py-0.5 text-xs font-medium tabular-nums">
                        Tổng {snapshot.sum}
                      </span>
                    );
                  } else if (snapshot.playType === "bigSmallDraw") {
                    const betLabel = snapshot.bet
                      ? (BINGO18_BIG_SMALL_BET_LABELS[snapshot.bet as keyof typeof BINGO18_BIG_SMALL_BET_LABELS] ??
                        snapshot.bet)
                      : "—";
                    selectionContent = (
                      <span className="bg-secondary rounded px-2 py-0.5 text-xs font-semibold">{betLabel}</span>
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
                            <span className="bg-profit/15 text-profit inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums">
                              ×{bp.matchCount}
                            </span>
                          )}
                          <span className="text-profit text-sm font-bold tabular-nums">
                            +{formatNumber(boardWinAmount)}
                          </span>
                        </div>
                      );
                    } else {
                      outcomeContent = <span className="text-muted-foreground text-xs">—</span>;
                    }
                  }

                  return (
                    <div
                      key={i}
                      className="grid items-start gap-x-3 rounded-md border-l-3 py-2 pl-3"
                      style={{
                        borderLeftColor: boardColor,
                        gridTemplateColumns: "2rem 8rem 1fr",
                      }}
                    >
                      <div className="flex items-center justify-center self-stretch">
                        <span className="text-sm leading-none font-extrabold" style={{ color: boardColor }}>
                          {snapshot.boardNo}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 pt-0.5">
                        <span className="text-foreground text-xs leading-tight font-semibold">
                          {BINGO18_PLAY_TYPE_LABELS[snapshot.playType as keyof typeof BINGO18_PLAY_TYPE_LABELS] ??
                            snapshot.playType}
                        </span>
                        {snapshot.betCount > 1 && (
                          <span className="text-muted-foreground text-xs leading-tight">×{snapshot.betCount}</span>
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
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Danh sách cược</p>
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
                          <span className="bg-secondary rounded px-2 py-0.5 text-xs font-medium">
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
                        <span className="bg-secondary rounded px-2 py-0.5 text-xs font-medium tabular-nums">
                          Tổng {snapshot.sum}
                        </span>
                      );
                    } else if (snapshot.playType === "bigSmallDraw") {
                      const betLabel = snapshot.bet
                        ? (BINGO18_BIG_SMALL_BET_LABELS[snapshot.bet as keyof typeof BINGO18_BIG_SMALL_BET_LABELS] ??
                          snapshot.bet)
                        : "—";
                      selectionContent = (
                        <span className="bg-secondary rounded px-2 py-0.5 text-xs font-semibold">{betLabel}</span>
                      );
                    } else {
                      selectionContent = <span className="text-muted-foreground">—</span>;
                    }

                    return (
                      <div
                        key={i}
                        className="grid items-start gap-x-3 rounded-md border-l-3 py-2 pl-3"
                        style={{
                          borderLeftColor: boardColor,
                          gridTemplateColumns: "2rem 8rem 1fr",
                        }}
                      >
                        <div className="flex items-center justify-center self-stretch">
                          <span className="text-sm leading-none font-extrabold" style={{ color: boardColor }}>
                            {snapshot.boardNo}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 pt-0.5">
                          <span className="text-foreground text-xs leading-tight font-semibold">
                            {BINGO18_PLAY_TYPE_LABELS[snapshot.playType as keyof typeof BINGO18_PLAY_TYPE_LABELS] ??
                              snapshot.playType}
                          </span>
                          {snapshot.betCount > 1 && (
                            <span className="text-muted-foreground text-xs leading-tight">×{snapshot.betCount}</span>
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
