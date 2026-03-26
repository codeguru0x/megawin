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
import type { TicketEntryEntity } from "@megawin/game-mega645/entities";
import { PlayType, PrizeTier } from "@megawin/game-mega645/entities/enums";
import { MEGA645_PLAY_TYPE_LABELS, MEGA645_PRIZE_TIER_LABELS } from "@megawin/game-mega645/labels";
import {
  ENTRY_STATUS_LABELS,
  ENTRY_OUTCOME_LABELS,
  REPORT_COLUMN_LABELS,
} from "@megawin/game-core/labels";
import type { EntryStatus } from "@megawin/game-core/entities";
import { useMega645Entries } from "../use-report-queries";
import { TableSkeleton, ErrorCard, EmptyCard } from "./shared-states";

// ─── Board Color Map ──────────────────────────────────────────────────────────

/**
 * CSS variable name cho từng board (A–F).
 * Dùng chung cho tất cả 7 games — định nghĩa trong globals.css.
 */
const BOARD_COLORS: Record<string, string> = {
  A: "var(--board-a)",
  B: "var(--board-b)",
  C: "var(--board-c)",
  D: "var(--board-d)",
  E: "var(--board-e)",
  F: "var(--board-f)",
};

// ─── Ball Display Helper ──────────────────────────────────────────────────────

/**
 * Hiển thị 1 quả bóng số tròn.
 * - matched (xanh chính): trùng số thắng
 * - default (muted): chưa có kết quả hoặc không trúng
 * - result: hiển thị số kết quả kỳ quay
 */
function Ball({
  n,
  variant = "default",
  size = "md",
}: {
  n: string;
  variant?: "default" | "matched" | "result";
  size?: "sm" | "md";
}) {
  const sizeClass = size === "sm" ? "size-7 text-[11px]" : "size-8 text-xs";
  const colorClass =
    variant === "matched"
      ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
      : variant === "result"
        ? "bg-primary text-primary-foreground"
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
 * Chi tiết 1 entry Mega 6/45.
 *
 * Layout:
 * 1. Header: title + "ticketNo · drawId"
 * 2. Metadata grid 2-column (Người chơi · Dòng cược / Đại lý · Đặt lúc)
 * 3. Status row (badge trạng thái + outcome)
 * 4. Financial KPI:
 *    - Outstanding: Tiền cược · Hoa hồng (2 ô)
 *    - Settled: Tiền cược · Trả thưởng · Hoa hồng · Lãi/lỗ (4 ô)
 * 5. Kết quả kỳ quay (6 winning numbers — chỉ khi có result, không phải scheduled)
 *    Mega 6/45 KHÔNG có bonus number.
 * 6. Bộ số đã chọn: boards A-F (6 số / board — highlight khi khớp)
 * 7. Giải trúng (chỉ khi có payout.tiers và không phải scheduled)
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
  if (!entry) return null;

  const tiers = entry.payout?.tiers ?? [];
  const boards = entry.entrySummary.boards ?? [];
  const isWin = (entry.payout?.payoutAmount ?? 0) > 0;
  const outcome = entry.outcome as string | undefined;
  // scheduled = đang chờ kết quả — KHÔNG hiển thị payout, lãi/lỗ, kết quả
  const isScheduled = entry.status === "scheduled";
  const playerNet = isScheduled ? null : (entry.payout?.payoutAmount ?? 0) - entry.amount;

  // Mega 6/45: chỉ có winningNumbers, KHÔNG có bonusNumber
  const winningSet = new Set<string>(entry.result?.winningNumbers ?? []);

  const tenantUsername = toTenantUsername(entry.username);
  const MAX_USERNAME_LEN = 14;
  const truncatedUsername =
    tenantUsername.length > MAX_USERNAME_LEN
      ? tenantUsername.slice(0, MAX_USERNAME_LEN) + "…"
      : tenantUsername;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Ticket className="size-4" />
            Chi tiết Entry — Mega 6/45
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
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
              /* Settled mode: đầy đủ 4 KPIs */
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

            {/* ── 4. Kết quả kỳ quay ────────────────────────────────────── */}
            {/* Mega 6/45: 6 winning numbers, KHÔNG có bonus number */}
            {entry.result && !isScheduled && (
              <div className="rounded-lg border p-4">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Kết quả — Kỳ {entry.drawId}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {entry.result.winningNumbers.map((n: string) => (
                    <Ball key={n} n={n} variant="result" />
                  ))}
                </div>
              </div>
            )}

            {/* ── 5. Bộ số đã chọn ──────────────────────────────────────── */}
            {/* Mega 6/45: mỗi board chọn 6 số từ pool 01-45.              */}
            {/* Highlight logic: số trùng winningNumbers → matched (xanh)  */}
            {boards.length > 0 && (
              <div className="rounded-lg border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Bộ số đã chọn
                  </p>
                  {entry.result && !isScheduled && (
                    /* Legend chú thích màu — chỉ hiển thị khi có kết quả */
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="inline-block size-3 rounded-full bg-primary" />
                        Trúng
                      </span>
                    </div>
                  )}
                </div>
                <div className="space-y-2.5">
                  {boards.map((board, i) => {
                    const playLabel =
                      MEGA645_PLAY_TYPE_LABELS[board.playType as PlayType] ?? board.playType;
                    const isStandard = board.playType === PlayType.Standard;
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
                        {/* Cột 1: Tên board */}
                        <div className="flex items-center justify-center self-stretch">
                          <span
                            className="text-sm font-extrabold leading-none"
                            style={{ color: boardColor }}
                          >
                            {board.boardNo}
                          </span>
                        </div>

                        {/* Cột 2: Kiểu chơi (hàng 1) + số lines (hàng 2) */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[11px] font-semibold leading-tight text-foreground">
                            {isStandard ? "Thường" : playLabel}
                          </span>
                          <span className="text-[10px] leading-tight text-muted-foreground">
                            {board.expandedLines > 1
                              ? `${formatNumber(board.expandedLines)} lines`
                              : "1 line"}
                            {board.betCount > 1 && (
                              <span className="ml-1 text-muted-foreground/70">
                                ×{board.betCount}
                              </span>
                            )}
                          </span>
                        </div>

                        {/* Cột 3: Danh sách số */}
                        <div className="flex flex-wrap items-center gap-1">
                          {board.numbers.map((n: string) => (
                            <Ball
                              key={n}
                              n={n}
                              size="sm"
                              variant={winningSet.has(n) ? "matched" : "default"}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
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
                  {tiers.map((tier, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-md bg-background/60 px-3 py-1.5 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-medium">
                          {MEGA645_PRIZE_TIER_LABELS[tier.tier as PrizeTier] ?? tier.tier}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          ×{tier.hitCount} line
                          {tier.unitAmount > 0 && ` · ${formatNumber(tier.unitAmount)}/line`}
                        </span>
                      </div>
                      <span className="tabular-nums font-bold text-profit">
                        {formatNumber(tier.amount)}
                      </span>
                    </div>
                  ))}
                  {/* Tổng giải */}
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

/** Cấp 4: Danh sách entries của 1 player cho 1 draw × 1 tenant. */
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
  const { data, isLoading, error } = useMega645Entries(drawId, tenantId, accountId);

  if (isLoading) return <TableSkeleton rows={5} />;
  if (error) return <ErrorCard />;
  if (!data?.length) return <EmptyCard msg="Không có entry nào." />;

  return (
    <>
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pb-2 pt-4">
          <div className="flex items-center gap-2">
            <Ticket className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">
              Entries — {playerDisplayName || accountId}
            </CardTitle>
          </div>
          <CardDescription className="text-xs">
            {data.length} entries · {REPORT_COLUMN_LABELS.drawId} {drawId} · {tenantId} · Click mã
            vé để xem chi tiết
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã vé</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.lineCount}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalStake}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                  <TableHead>Giải</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((entry) => {
                  const entryTiers = entry.payout?.tiers ?? [];
                  const status = entry.status as EntryStatus;

                  return (
                    <TableRow
                      key={entry.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedEntry(entry)}
                    >
                      <TableCell className="font-medium">{entry.entrySummary.ticketNo}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(entry.lineCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(entry.amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
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
                        {entryTiers.length > 0 ? (
                          <Badge variant="secondary">
                            {MEGA645_PRIZE_TIER_LABELS[entryTiers[0]?.tier as PrizeTier] ??
                              entryTiers[0]?.tier}
                            {entryTiers.length > 1 ? ` +${entryTiers.length - 1}` : ""}
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

      <Mega645EntryDetailDialog
        entry={selectedEntry}
        open={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
    </>
  );
}
