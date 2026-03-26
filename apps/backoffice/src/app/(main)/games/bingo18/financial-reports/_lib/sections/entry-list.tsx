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
import { formatNumber, toTenantUsername, formatVN } from "@megawin/shared/utils";
import { REPORT_COLUMN_LABELS, ENTRY_STATUS_LABELS } from "@megawin/game-core/labels";
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
import { useBingo18Entries } from "../use-report-queries";
import { TableSkeleton, ErrorCard, EmptyCard } from "./shared-states";

// ─── Board Color Map ──────────────────────────────────────────────────────────

const BOARD_COLORS: Record<string, string> = {
  A: "var(--board-a)",
  B: "var(--board-b)",
  C: "var(--board-c)",
  D: "var(--board-d)",
  E: "var(--board-e)",
  F: "var(--board-f)",
};

// ─── Dice Display ─────────────────────────────────────────────────────────────

/**
 * Hiển thị 1 mặt xúc xắc (1-6).
 * - matched: xanh chính — số này xuất hiện trong kết quả và là số player chọn
 * - result: dùng cho 3 ô kết quả kỳ quay
 * - default: muted — số player chọn chưa settle
 */
function Die({
  n,
  variant = "default",
  size = "md",
}: {
  n: number | string;
  variant?: "default" | "matched" | "result";
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "lg" ? "size-10 text-lg" : size === "sm" ? "size-7 text-[11px]" : "size-8 text-sm";
  const colorClass =
    variant === "matched"
      ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
      : variant === "result"
        ? "bg-primary text-primary-foreground shadow-md"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg font-bold tabular-nums ${sizeClass} ${colorClass}`}
    >
      {n}
    </span>
  );
}

// ─── Entry Detail Dialog ──────────────────────────────────────────────────────

/**
 * Chi tiết 1 entry Bingo 18.
 *
 * Layout:
 * 1. Header: title + "ticketNo · drawId"
 * 2. Metadata strip (2 col): Người chơi · Số boards / Đại lý · Đặt lúc
 * 3. Status row
 * 4. Financial KPI: Outstanding (2 ô) hoặc Settled (4 ô)
 * 5. Kết quả kỳ quay: 3 xúc xắc + tổng (chỉ khi settled)
 * 6. Danh sách boards — 3 cột: Board | Kiểu chơi | Số/Lựa chọn
 * 7. Tổng thưởng (chỉ khi win)
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
  if (!entry) return null;

  const payout = entry.payout as any;
  const allBoardPayouts: EntryBoardPayout[] = payout?.boardPayouts ?? [];
  // Map theo boardNo — dùng để tra payout của từng board
  const payoutByBoardNo = new Map(allBoardPayouts.map((bp) => [bp.boardNo, bp]));
  const allBoardSnapshots: EntryBoardSnapshot[] = entry.entrySummary?.boards ?? [];

  const winAmount: number = payout?.winAmount ?? 0;
  const payoutAmount: number = payout?.payoutAmount ?? 0;
  const isScheduled = entry.status === "scheduled";
  const playerNet = isScheduled ? null : payoutAmount - entry.amount;

  // Kết quả 3 xúc xắc — chỉ có sau settle/publish
  const drawNumbers: number[] = (entry as any).result?.numbers ?? [];
  const drawSum: number = (entry as any).result?.sum ?? 0;

  const tenantUsername = toTenantUsername(entry.username ?? (entry as any).accountId ?? "");
  const MAX_USERNAME_LEN = 14;
  const truncatedUsername =
    tenantUsername.length > MAX_USERNAME_LEN
      ? tenantUsername.slice(0, MAX_USERNAME_LEN) + "…"
      : tenantUsername;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Ticket className="size-4" />
            Chi tiết Entry — Bingo 18
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
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
                        <span className="cursor-default font-semibold">{truncatedUsername}</span>
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
                  Số boards
                </span>
                <span className="font-semibold tabular-nums">{allBoardSnapshots.length}</span>
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
                  {formatVN(new Date(entry.createdAt as unknown as string), "dd/MM HH:mm")}
                </span>
              </div>
            </div>

            {/* ── 2. Status row ──────────────────────────────────────────── */}
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
              {isScheduled && (
                <span className="ml-auto text-[11px] text-amber-600 dark:text-amber-400">
                  Kết quả có sau kỳ quay
                </span>
              )}
            </div>

            {/* ── 3. Financial KPI strip ─────────────────────────────────── */}
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
                    <p
                      className={`text-sm font-bold tabular-nums ${winAmount > 0 ? "text-profit" : ""}`}
                    >
                      {formatNumber(payoutAmount)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 p-3">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900/50">
                    <HandCoins className="size-3.5 text-amber-600 dark:text-amber-400" />
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

            {/* ── 4. Kết quả kỳ quay — 3 xúc xắc ─────────────────────── */}
            {drawNumbers.length > 0 && !isScheduled && (
              <div className="rounded-lg border p-4">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Kết quả — Kỳ {entry.drawId}
                </p>
                <div className="flex items-center justify-center gap-4">
                  {drawNumbers.map((num, i) => (
                    <Die key={i} n={num} variant="result" size="lg" />
                  ))}
                  {drawSum > 0 && (
                    <span className="ml-2 text-sm font-medium text-muted-foreground">
                      Tổng:{" "}
                      <span className="tabular-nums font-bold text-foreground">{drawSum}</span>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ── 5. Danh sách boards — 3 cột: Board | Kiểu chơi | Lựa chọn ── */}
            {allBoardSnapshots.length > 0 && (
              <div className="rounded-lg border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Danh sách cược
                  </p>
                  {!isScheduled && winAmount > 0 && (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className="inline-block size-3 rounded bg-profit" />
                      Trúng thưởng
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {allBoardSnapshots.map((snapshot, i) => {
                    const boardColor = BOARD_COLORS[snapshot.boardNo] ?? BOARD_COLORS.A;
                    const bp = payoutByBoardNo.get(snapshot.boardNo);
                    const isSideBet = BINGO18_SIDE_BET_PLAY_TYPE_SET.has(snapshot.playType);
                    const isWin = !isScheduled && (bp?.isWin ?? false);
                    const boardWinAmount = bp?.winAmount ?? 0;

                    // ── Cột 3: nội dung lựa chọn theo playType ─────────────
                    let selectionContent: React.ReactNode;
                    if (snapshot.playType === "singleNum" || snapshot.playType === "doubleMatch") {
                      const num = snapshot.number;
                      const isMatchedInResult =
                        !isScheduled && num != null && drawNumbers.includes(num);
                      selectionContent =
                        num != null ? (
                          <Die n={num} size="sm" variant={isMatchedInResult ? "matched" : "default"} />
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
                        const allMatch =
                          !isScheduled && num != null && drawNumbers.every((d) => d === num);
                        selectionContent =
                          num != null ? (
                            <Die n={num} size="sm" variant={allMatch ? "matched" : "default"} />
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
                        ? (BINGO18_BIG_SMALL_BET_LABELS[snapshot.bet as keyof typeof BINGO18_BIG_SMALL_BET_LABELS] ?? snapshot.bet)
                        : "—";
                      selectionContent = (
                        <span className="rounded bg-secondary px-2 py-0.5 text-xs font-semibold">
                          {betLabel}
                        </span>
                      );
                    } else {
                      selectionContent = <span className="text-muted-foreground">—</span>;
                    }

                    // ── Outcome / matchCount badge (chỉ sau settle) ─────────
                    let outcomeNode: React.ReactNode = null;
                    if (!isScheduled && bp) {
                      if (!isSideBet) {
                        // Basic: hiển thị matchCount (số lần số player chọn xuất hiện)
                        const mc = bp.matchCount;
                        if (isWin && mc != null && mc > 0) {
                          outcomeNode = (
                            <Badge className="bg-profit text-profit-foreground text-[10px] px-1.5 py-0">
                              ×{mc}
                            </Badge>
                          );
                        }
                      } else {
                        // Side bet: hiển thị kết quả thực tế
                        const outcome = bp.outcome;
                        if (outcome != null) {
                          const outcomeText =
                            snapshot.playType === "bigSmallDraw"
                              ? (BINGO18_BIG_SMALL_BET_LABELS[outcome as keyof typeof BINGO18_BIG_SMALL_BET_LABELS] ?? outcome)
                              : `Tổng ${outcome}`;
                          outcomeNode = (
                            <span className="text-[10px] text-muted-foreground">= {outcomeText}</span>
                          );
                        }
                      }
                    }

                    return (
                      <div
                        key={i}
                        className="grid items-center gap-x-3 rounded-md border-l-[3px] py-2 pl-3"
                        style={{
                          borderLeftColor: boardColor,
                          gridTemplateColumns: "2rem 8rem 1fr",
                        }}
                      >
                        {/* Cột 1: Tên board */}
                        <div className="flex items-center justify-center self-stretch">
                          <span
                            className="text-sm font-extrabold leading-none"
                            style={{ color: boardColor }}
                          >
                            {snapshot.boardNo}
                          </span>
                        </div>

                        {/* Cột 2: Kiểu chơi + betCount */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-semibold text-foreground leading-tight">
                            {BINGO18_PLAY_TYPE_LABELS[snapshot.playType as keyof typeof BINGO18_PLAY_TYPE_LABELS] ?? snapshot.playType}
                          </span>
                          {snapshot.betCount > 1 && (
                            <span className="text-[10px] text-muted-foreground leading-tight">
                              ×{snapshot.betCount}
                            </span>
                          )}
                        </div>

                        {/* Cột 3: Lựa chọn + outcome + win amount */}
                        <div className="flex flex-wrap items-center gap-2">
                          {selectionContent}
                          {outcomeNode}
                          {!isScheduled && (
                            <div className="ml-auto pr-1">
                              {isWin ? (
                                <span className="text-sm font-bold tabular-nums text-profit">
                                  +{formatNumber(boardWinAmount)}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── 6. Tổng thưởng — chỉ khi win ────────────────────────── */}
            {winAmount > 0 && !isScheduled && (
              <div className="rounded-lg border border-profit/30 bg-profit/5 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-profit">
                    Tổng thưởng
                  </p>
                  <span className="text-lg font-bold tabular-nums text-profit">
                    {formatNumber(winAmount)}
                  </span>
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
  const { data, isLoading, error } = useBingo18Entries(drawId, tenantId, accountId);

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
                  <TableHead className="text-right">Tiền cược</TableHead>
                  <TableHead className="text-right">Tiền thắng</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((entry) => {
                  const p = payout(entry);
                  const winAmount = p?.winAmount ?? 0;
                  const payoutAmount = p?.payoutAmount ?? 0;
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

const EntryDetailDialog = Bingo18EntryDetailDialog;
