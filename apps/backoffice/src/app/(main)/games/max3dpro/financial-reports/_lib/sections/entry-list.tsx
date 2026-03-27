"use client";

import { useState } from "react";
import { Ticket, Building2, User, Clock, Layers, Banknote, HandCoins } from "lucide-react";
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
import {
  REPORT_COLUMN_LABELS,
  ENTRY_STATUS_LABELS,
  ENTRY_OUTCOME_LABELS,
} from "@megawin/game-core/labels";
import type {
  TicketEntryEntity,
  EntryBoardSnapshot,
  EntryPayoutTier,
} from "@megawin/game-max3dpro/entities";
import { useMax3DProEntries } from "../use-report-queries";
import { TableSkeleton, ErrorCard, EmptyCard } from "./shared-states";

// ─── Prize Tier Labels ────────────────────────────────────────────────────────

const MAX3DPRO_PRIZE_LABELS: Record<string, string> = {
  special: "Giải Đặc Biệt",
  specialSub: "Giải Phụ ĐB",
  first: "Giải Nhất",
  second: "Giải Nhì",
  third: "Giải Ba",
  fourth: "Giải Tư",
  fifth: "Giải Năm",
  sixth: "Giải Sáu",
};

// ─── Board Color Map (A–D, Max 3D Pro tối đa 4 boards) ───────────────────────

const BOARD_COLORS: Record<string, string> = {
  A: "var(--board-a)",
  B: "var(--board-b)",
  C: "var(--board-c)",
  D: "var(--board-d)",
};

// ─── Play Mode Label ──────────────────────────────────────────────────────────

function playModeLabel(board: EntryBoardSnapshot): string | null {
  if (board.playMode === "multiNumber") {
    const n = board.triplets.length;
    return `Bao ${n} bộ`;
  }
  if (board.playMode === "multiDigit") {
    return "Bao chữ số";
  }
  return null;
}

// ─── Draw Result Sets (để highlight triplets đã trúng) ───────────────────────

function buildResultSet(result: TicketEntryEntity["result"]): Set<string> {
  if (!result) return new Set();
  return new Set([
    ...(result.special ?? []),
    ...(result.first ?? []),
    ...(result.second ?? []),
    ...(result.third ?? []),
  ]);
}

// ─── Entry Detail Dialog ──────────────────────────────────────────────────────

/**
 * Chi tiết 1 entry Max 3D Pro — layout giống Power 6/55:
 *
 * 1. Header: title + "ticketNo · drawId"
 * 2. Metadata strip 2-column: Người chơi · Cặp số · Đại lý · Đặt lúc
 * 3. Status row: badge trạng thái + outcome + "Kết quả có sau kỳ quay"
 * 4. Financial KPI strip:
 *    - Outstanding: Tiền cược · Hoa hồng đại lý (2 ô với icon)
 *    - Settled: Tiền cược · Trả thưởng · Hoa hồng · Lãi/lỗ (4 ô)
 * 5. Bộ số đã chọn: boards A–D (triplets, highlight khi có result)
 * 6. Giải trúng (chỉ khi settled và có tiers)
 */
export function Max3dproEntryDetailDialog({
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
  const boards = entry.entrySummary.boards ?? [];
  const isWin = (entry.payout?.payoutAmount ?? 0) > 0;
  const outcome = entry.outcome as string | undefined;
  // scheduled = đang chờ kết quả — KHÔNG hiển thị payout, lãi/lỗ, kết quả
  const isScheduled = entry.status === "scheduled";
  const playerNet = isScheduled ? null : (entry.payout?.payoutAmount ?? 0) - entry.amount;

  const resultSet = buildResultSet(entry.result);

  const tenantUsername = toTenantUsername(entry.username) ?? entry.username;
  const MAX_USERNAME_LEN = 14;
  const truncatedUsername =
    tenantUsername.length > MAX_USERNAME_LEN
      ? tenantUsername.slice(0, MAX_USERNAME_LEN) + "…"
      : tenantUsername;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Ticket className="size-4" />
            Chi tiết Entry — Max 3D Pro
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {entry.entrySummary.ticketNo} · {entry.drawId}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[76vh]">
          <div className="space-y-4 pr-2">
            {/* ── 1. Metadata strip 2-column ─────────────────────────────── */}
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
                  <Layers className="size-3.5 shrink-0" />
                  Cặp số
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
              {outcome && (
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

            {/* ── 3. Financial KPI strip ─────────────────────────────────── */}
            {isScheduled ? (
              /* Outstanding mode: Tiền cược · Hoa hồng ĐL */
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
              /* Settled mode: 4 KPIs đầy đủ */
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
                      {formatNumber(entry.payout?.payoutAmount ?? 0)}
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

            {/* ── 4. Bộ số đã chọn ──────────────────────────────────────── */}
            {boards.length > 0 && (
              <div className="rounded-lg border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Bộ số đã chọn
                  </p>
                  {entry.result && !isScheduled && (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className="inline-block size-3 rounded bg-profit" />
                      Bộ trúng
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {boards.map((board, i) => {
                    const modeLabel = playModeLabel(board);
                    const boardColor = BOARD_COLORS[board.boardNo] ?? BOARD_COLORS.A;
                    return (
                      <div
                        key={i}
                        className="grid items-center gap-x-3 rounded-md border-l-[3px] py-2 pl-3 pr-2"
                        style={{
                          borderLeftColor: boardColor,
                          gridTemplateColumns: "2rem 5rem 1fr",
                        }}
                      >
                        {/* Cột 1: Tên board */}
                        <div className="flex items-center justify-center self-stretch">
                          <span
                            className="text-sm font-extrabold leading-none"
                            style={{ color: boardColor }}
                          >
                            {board.boardNo}
                          </span>
                        </div>

                        {/* Cột 2: Kiểu chơi + số cặp */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-semibold leading-tight text-foreground">
                            {modeLabel ?? "Thường"}
                          </span>
                          <span className="text-[10px] leading-tight text-muted-foreground">
                            {formatNumber(board.lineCount)} cặp
                            {board.betCount > 1 && (
                              <span className="ml-1 text-muted-foreground/70">
                                ×{board.betCount}
                              </span>
                            )}
                          </span>
                        </div>

                        {/* Cột 3: Số đã chọn */}
                        <div className="flex flex-wrap items-center gap-1">
                          {board.playMode === "multiDigit" &&
                          board.frontDigits &&
                          board.backDigits ? (
                            /* multiDigit: digits đầu × digits cuối */
                            <>
                              {board.frontDigits.map((d, j) => (
                                <span
                                  key={`f-${j}`}
                                  className="inline-flex size-6 items-center justify-center rounded bg-muted font-mono text-[11px] font-bold tabular-nums text-muted-foreground"
                                >
                                  {d}
                                </span>
                              ))}
                              <span className="select-none px-0.5 text-[10px] text-muted-foreground/40">
                                ×
                              </span>
                              {board.backDigits.map((d, j) => (
                                <span
                                  key={`b-${j}`}
                                  className="inline-flex size-6 items-center justify-center rounded bg-muted font-mono text-[11px] font-bold tabular-nums text-muted-foreground"
                                >
                                  {d}
                                </span>
                              ))}
                            </>
                          ) : (
                            /* multiNumber: từng triplet, highlight nếu trúng */
                            board.triplets.map((t, j) => {
                              const isMatched = !isScheduled && resultSet.has(t);
                              return (
                                <span
                                  key={j}
                                  className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums ${
                                    isMatched
                                      ? "bg-profit text-profit-foreground ring-1 ring-profit/40"
                                      : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {t}
                                </span>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── 5. Kết quả kỳ quay ────────────────────────────────────── */}
            {entry.result && !isScheduled && (
              <div className="rounded-lg border p-4">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Kết quả — Kỳ {entry.drawId}
                </p>
                <div className="space-y-1.5">
                  {[
                    { label: "Đặc Biệt", triplets: entry.result.special },
                    { label: "Giải Nhất", triplets: entry.result.first },
                    { label: "Giải Nhì", triplets: entry.result.second },
                    { label: "Giải Ba", triplets: entry.result.third },
                  ].map(({ label, triplets }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="w-20 shrink-0 text-[10px] text-muted-foreground">
                        {label}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {triplets.map((t, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center justify-center rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums text-muted-foreground"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── 6. Giải trúng ─────────────────────────────────────────── */}
            {tiers.length > 0 && !isScheduled && (
              <div className="rounded-lg border border-profit/30 bg-profit/5 p-4">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-profit">
                  Giải trúng
                </p>
                <div className="space-y-2">
                  {tiers.map((tier: EntryPayoutTier, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-md bg-background/60 px-3 py-1.5 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-medium">
                          {MAX3DPRO_PRIZE_LABELS[tier.tier] ?? tier.tier}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          ×{tier.hitCount} cặp
                          {tier.unitAmount > 0 && ` · ${formatNumber(tier.unitAmount)}/cặp`}
                        </span>
                      </div>
                      <span className="font-bold tabular-nums text-profit">
                        +{formatNumber(tier.amount)}
                      </span>
                    </div>
                  ))}
                  {tiers.length > 1 && (
                    <div className="flex items-center justify-between border-t pt-2 text-sm font-bold">
                      <span className="text-muted-foreground">Tổng thưởng</span>
                      <span className="tabular-nums text-profit">
                        {formatNumber(entry.payout?.payoutAmount ?? 0)}
                      </span>
                    </div>
                  )}
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
  const { data, isLoading, error } = useMax3DProEntries(drawId, tenantId, accountId);

  const playerLabel = playerDisplayName || (toTenantUsername(accountId) ?? accountId);

  if (isLoading) return <TableSkeleton rows={5} />;
  if (error) return <ErrorCard message="Lỗi tải entries." />;
  if (!data?.length) return <EmptyCard icon="ticket" message="Không có entry nào." />;

  return (
    <>
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pb-2 pt-4">
          <div className="flex items-center gap-2">
            <Ticket className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Entries — {playerLabel}</CardTitle>
          </div>
          <CardDescription className="text-xs">
            {data.length} entries · Kỳ {drawId} · {tenantId} · Click mã vé để xem chi tiết
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã vé</TableHead>
                  <TableHead className="text-right">Cặp số</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalStake}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                  <TableHead>Giải cao nhất</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((entry) => {
                  const tiers = entry.payout?.tiers ?? [];
                  const topTier = tiers[0];
                  const status = entry.status as string;
                  return (
                    <TableRow
                      key={entry.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedEntry(entry)}
                    >
                      <TableCell>
                        <button className="font-mono text-xs text-primary underline-offset-2 hover:underline">
                          {entry.entrySummary.ticketNo}
                        </button>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNumber(entry.lineCount)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNumber(entry.amount)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {status === "settled" ? (
                          (entry.payout?.payoutAmount ?? 0) > 0 ? (
                            <span className="font-medium text-profit">
                              {formatNumber(entry.payout?.payoutAmount ?? 0)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {topTier ? (
                          <Badge variant="secondary" className="text-xs">
                            {MAX3DPRO_PRIZE_LABELS[topTier.tier] ?? topTier.tier}
                            {tiers.length > 1 ? ` +${tiers.length - 1}` : ""}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            status === "settled"
                              ? "default"
                              : status === "void"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {ENTRY_STATUS_LABELS[status as keyof typeof ENTRY_STATUS_LABELS] ??
                            status}
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

const EntryDetailDialog = Max3dproEntryDetailDialog;
