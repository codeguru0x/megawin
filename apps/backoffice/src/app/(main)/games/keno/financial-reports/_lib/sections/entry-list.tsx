"use client";

import { useState } from "react";
import { Ticket, Building2, User, Clock, Banknote, HandCoins } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { formatNumber, displayVNDateTime, toTenantUsername, formatVN } from "@megawin/shared/utils";
import {
  REPORT_COLUMN_LABELS,
  ENTRY_STATUS_LABELS,
  ENTRY_OUTCOME_LABELS,
} from "@megawin/game-core/labels";
import { KENO_SIDE_BET_PLAY_TYPE_SET } from "@megawin/game-keno/entities";
import type {
  TicketEntryEntity,
  EntryBoardSnapshot,
  EntryBoardPayout,
} from "@megawin/game-keno/entities";
import { useKenoEntries } from "../use-report-queries";
import { TableSkeleton, ErrorCard, EmptyCard } from "./shared-states";

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
  variant?: "default" | "matched" | "result";
}) {
  const cls =
    variant === "matched"
      ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
      : variant === "result"
        ? "bg-primary text-primary-foreground"
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

/** Chi tiết 1 entry Keno — boards chọn số, side bets, kết quả 20 số. */
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

  // Đọc boards từ entrySummary (luôn có, kể cả khi scheduled)
  const boards: EntryBoardSnapshot[] = entry.entrySummary?.boards ?? [];
  const basicBoards = boards.filter((b) => !KENO_SIDE_BET_PLAY_TYPE_SET.has(b.playType));
  const sideBetBoards = boards.filter((b) => KENO_SIDE_BET_PLAY_TYPE_SET.has(b.playType));

  // Payout data — chỉ có sau khi settle
  const boardPayoutsMap = new Map<string, EntryBoardPayout>(
    (entry.payout?.boardPayouts ?? []).map((p: EntryBoardPayout) => [p.boardNo + p.playType, p]),
  );
  const payoutAmount: number = entry.payout?.payoutAmount ?? 0;
  const isWin = payoutAmount > 0;
  const outcome = entry.outcome as string | undefined;
  const isScheduled = entry.status === "scheduled";
  const playerNet = isScheduled ? null : payoutAmount - entry.amount;

  // 20 số kết quả kỳ quay — chỉ có sau settle/publish
  const winningSet = new Set<string>(entry.result?.winningNumbers ?? []);

  const tenantUsername = toTenantUsername(entry.username);
  const MAX_LEN = 14;
  const displayUsername =
    tenantUsername.length > MAX_LEN ? tenantUsername.slice(0, MAX_LEN) + "…" : tenantUsername;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Ticket className="size-4" />
            Chi tiết Entry — Keno
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {entry.entrySummary?.ticketNo ?? entry.id} · {entry.drawId}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[76vh]">
          <div className="space-y-4 pr-2">
            {/* ── 1. Metadata strip ──────────────────────────────────── */}
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
                        <span className="cursor-default font-semibold">{displayUsername}</span>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="font-mono text-xs">{tenantUsername}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <span className="font-semibold">{tenantUsername}</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Ticket className="size-3.5 shrink-0" />
                  Panels
                </span>
                <span className="font-semibold tabular-nums">{boards.length}</span>
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
                  {formatVN(new Date(entry.createdAt as unknown as string), "dd/MM HH:mm")}
                </span>
              </div>
            </div>

            {/* ── 2. Status row ──────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border px-4 py-2.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Trạng thái
              </span>
              <Badge
                variant={
                  entry.status === "settled"
                    ? "default"
                    : entry.status === "void"
                      ? "destructive"
                      : "secondary"
                }
              >
                {ENTRY_STATUS_LABELS[entry.status as keyof typeof ENTRY_STATUS_LABELS] ??
                  entry.status}
              </Badge>
              {outcome && !isScheduled && (
                <Badge
                  className={
                    isWin
                      ? "border-transparent bg-profit text-profit-foreground hover:bg-profit/80"
                      : ""
                  }
                  variant={outcome === "void" ? "destructive" : isWin ? "default" : "secondary"}
                >
                  {ENTRY_OUTCOME_LABELS[outcome as keyof typeof ENTRY_OUTCOME_LABELS] ?? outcome}
                </Badge>
              )}
              {isScheduled && (
                <span className="ml-auto text-[11px] text-amber-600 dark:text-amber-400">
                  Kết quả có sau kỳ quay
                </span>
              )}
            </div>

            {/* ── 3. Financial KPI ───────────────────────────────────── */}
            {isScheduled ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-900/50">
                    <Banknote className="size-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Tiền cược</p>
                    <p className="text-sm font-bold tabular-nums">{formatNumber(entry.amount)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900/50">
                    <HandCoins className="size-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Hoa hồng đại lý</p>
                    <p className="text-sm font-bold tabular-nums">
                      {formatNumber(entry.tenant.commissionAmount)}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 p-3">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-900/50">
                    <Banknote className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Tiền cược</p>
                    <p className="text-sm font-bold tabular-nums">{formatNumber(entry.amount)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 p-3">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-900/50">
                    <Banknote className="size-3.5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">
                      {REPORT_COLUMN_LABELS.totalPayout}
                    </p>
                    <p className={`text-sm font-bold tabular-nums ${isWin ? "text-profit" : ""}`}>
                      {formatNumber(payoutAmount)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 p-3">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900/50">
                    <HandCoins className="size-3.5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Hoa hồng ĐL</p>
                    <p className="text-sm font-bold tabular-nums">
                      {formatNumber(entry.tenant.commissionAmount)}
                    </p>
                  </div>
                </div>
                {playerNet !== null && (
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-[11px] text-muted-foreground">Lãi/lỗ (khách)</p>
                    <p
                      className={`text-sm font-bold tabular-nums ${
                        playerNet > 0
                          ? "text-profit"
                          : playerNet < 0
                            ? "text-loss"
                            : "text-muted-foreground"
                      }`}
                    >
                      {playerNet > 0 ? "+" : ""}
                      {formatNumber(playerNet)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── 4. Kết quả 20 số kỳ quay ─────────────────────────── */}
            {winningSet.size > 0 && !isScheduled && (
              <div className="rounded-lg border p-4">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Kết quả kỳ quay — {entry.drawId}
                </p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {[...winningSet]
                    .sort((a, b) => Number(a) - Number(b))
                    .map((num) => (
                      <Ball key={num} n={num} variant="result" />
                    ))}
                </div>
              </div>
            )}

            {/* ── 5. Bộ số đã chọn (cơ bản pick1-pick10) ──────────── */}
            {basicBoards.length > 0 && (
              <div className="rounded-lg border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Bộ số đã chọn
                  </p>
                  {!isScheduled && winningSet.size > 0 && (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="inline-block size-3 rounded-full bg-primary" />
                      Trúng
                    </div>
                  )}
                </div>
                <div className="space-y-2.5">
                  {basicBoards.map((board) => {
                    const boardColor = BOARD_COLORS[board.boardNo] ?? BOARD_COLORS.A;
                    const payout = boardPayoutsMap.get(board.boardNo + board.playType);
                    const pickLabel = KENO_PLAY_TYPE_LABELS[board.playType] ?? board.playType;
                    const nums: string[] = board.numbers ?? [];
                    return (
                      <div
                        key={board.boardNo + board.playType}
                        className="flex flex-wrap items-center gap-1.5 rounded-md border-l-[3px] py-1 pl-3"
                        style={{ borderLeftColor: boardColor }}
                      >
                        {/* Label */}
                        <div className="flex w-24 shrink-0 items-center gap-1.5">
                          <span className="text-xs font-bold" style={{ color: boardColor }}>
                            {board.boardNo}
                          </span>
                          <span className="rounded bg-secondary px-1 py-0.5 text-[9px] text-muted-foreground">
                            {pickLabel}
                          </span>
                          {board.betCount > 1 && (
                            <span className="rounded bg-secondary px-1 py-0.5 text-[9px] text-muted-foreground">
                              ×{board.betCount}
                            </span>
                          )}
                        </div>
                        {/* Numbers */}
                        {nums.map((n) => (
                          <Ball
                            key={n}
                            n={n}
                            variant={!isScheduled && winningSet.has(n) ? "matched" : "default"}
                          />
                        ))}
                        {/* Match result badge */}
                        {payout && !isScheduled && (
                          <div className="ml-auto flex items-center gap-1.5">
                            {payout.isWin ? (
                              <>
                                <Badge className="bg-profit text-profit-foreground text-[10px] px-1.5 py-0">
                                  Trúng {payout.matchCount ?? 0}/{payout.pickCount ?? 0}
                                </Badge>
                                <span className="text-sm font-bold text-profit tabular-nums">
                                  +{formatNumber(payout.winAmount)}
                                </span>
                              </>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">
                                {payout.matchCount ?? 0}/{payout.pickCount ?? 0} số
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── 6. Side bets ──────────────────────────────────────── */}
            {sideBetBoards.length > 0 && (
              <div className="rounded-lg border p-4">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Cược bổ sung
                </p>
                <div className="space-y-2">
                  {sideBetBoards.map((board) => {
                    const boardColor = BOARD_COLORS[board.boardNo] ?? BOARD_COLORS.A;
                    const payout = boardPayoutsMap.get(board.boardNo + board.playType);
                    const typeLabel = KENO_PLAY_TYPE_LABELS[board.playType] ?? board.playType;
                    const betLabel = board.bet ? (KENO_BET_LABELS[board.bet] ?? board.bet) : "—";
                    return (
                      <div
                        key={board.boardNo + board.playType}
                        className="flex items-center gap-3 rounded-md border-l-[3px] py-2 pl-3 text-sm"
                        style={{ borderLeftColor: boardColor }}
                      >
                        <span className="text-xs font-bold w-5" style={{ color: boardColor }}>
                          {board.boardNo}
                        </span>
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {typeLabel}
                        </span>
                        <span className="font-semibold">{betLabel}</span>
                        {board.betCount > 1 && (
                          <span className="text-[10px] text-muted-foreground">
                            ×{board.betCount}
                          </span>
                        )}
                        {payout && !isScheduled && (
                          <div className="ml-auto flex items-center gap-2">
                            {payout.isWin ? (
                              <>
                                <Badge className="bg-profit text-profit-foreground text-[10px] px-1.5 py-0">
                                  Trúng
                                </Badge>
                                <span className="font-bold text-profit tabular-nums">
                                  +{formatNumber(payout.winAmount)}
                                </span>
                              </>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">Không trúng</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
// ─── Entry List ───────────────────────────────────────────────────────────────

export function EntryList({
  drawId,
  tenantId,
  accountId,
  playerDisplayName,
}: {
  drawId: string;
  tenantId: string;
  accountId: string;
  playerDisplayName?: string;
}) {
  const [selectedEntry, setSelectedEntry] = useState<TicketEntryEntity | null>(null);
  const { data, isLoading, error } = useKenoEntries(drawId, tenantId, accountId);

  const playerLabel = toTenantUsername(playerDisplayName ?? accountId) ?? accountId;

  if (isLoading) return <TableSkeleton rows={5} />;
  if (error) return <ErrorCard message="Lỗi tải entries." />;
  if (!data?.length) return <EmptyCard icon="ticket" message="Không có entry nào." />;

  const payout = (e: TicketEntryEntity) => e.payout as any;

  return (
    <>
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pb-2 pt-4">
          <div className="flex items-center gap-2">
            <Ticket className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Entries — {playerLabel}</CardTitle>
          </div>
          <CardDescription className="text-xs">
            {data.length} entries · Kỳ {drawId} · {tenantId}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã vé</TableHead>
                  <TableHead className="text-right">Boards</TableHead>
                  <TableHead className="text-right">Tiền cược</TableHead>
                  <TableHead className="text-right">Tiền thắng</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                  <TableHead>
                    {REPORT_COLUMN_LABELS.entryCount === "Lượt cược" ? "Trạng thái" : "Trạng thái"}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((entry) => {
                  const p = payout(entry);
                  const winAmount = p?.winAmount ?? 0;
                  const payoutAmount = p?.payoutAmount ?? 0;
                  const boardCount = p?.boardPayouts?.length ?? 0;
                  return (
                    <TableRow
                      key={entry.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedEntry(entry)}
                    >
                      <TableCell>
                        <button className="font-mono text-xs text-primary underline-offset-2 hover:underline">
                          {entry.id.slice(-8)}
                        </button>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNumber(boardCount)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNumber(entry.amount)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {entry.status === "settled" ? (
                          winAmount > 0 ? (
                            <span className="font-medium text-profit">
                              {formatNumber(winAmount)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {entry.status === "settled" ? (
                          formatNumber(payoutAmount)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            entry.status === "settled"
                              ? "default"
                              : entry.status === "void"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {ENTRY_STATUS_LABELS[entry.status as keyof typeof ENTRY_STATUS_LABELS] ??
                            entry.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <EntryDetailDialog
        entry={selectedEntry}
        open={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
    </>
  );
}

const EntryDetailDialog = KenoEntryDetailDialog;
