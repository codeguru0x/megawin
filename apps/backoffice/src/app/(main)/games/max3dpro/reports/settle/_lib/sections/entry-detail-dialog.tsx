"use client";

import Link from "next/link";

import { EntryStatus } from "@megawin/game-core/entities";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import type { EntryBoardSnapshot, EntryPayoutTier, TicketEntryEntity } from "@megawin/game-max3dpro/entities";
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

import { TripletDisplay } from "@/components/games/max3dpro/triplet-display";
import { EntryDetailDialogLoading } from "@/components/games/shared/skeletons/entry-detail-skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { boardColorVar } from "@/lib/game-colors";

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

// Thứ tự hiển thị: Đặc Biệt → Phụ ĐB → Nhất → Nhì → Ba → Tư → Năm → Sáu
const PRIZE_TIER_ORDER: string[] = ["special", "specialSub", "first", "second", "third", "fourth", "fifth", "sixth"];

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
 * Chi tiết 1 entry Max 3D Pro — cùng pattern với Max 3D.
 *
 * Layout:
 * 1. Header: title + status icon + "ticketNo · drawId"
 * 2. Metadata strip 2-column: Người chơi · Cặp số · Đại lý · Đặt lúc
 * 3. Financial KPI strip:
 *    - Outstanding: Tiền cược · Hoa hồng đại lý (2 ô với icon)
 *    - Settled: Tiền cược · Trả thưởng · Hoa hồng · Lãi/lỗ (4 ô 2×2)
 * 4. Kết quả kỳ quay (chỉ khi settled, highlight số trùng player chọn)
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
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        {entry ? (
          <Max3dproEntryDetailContent entry={entry} />
        ) : (
          <EntryDetailDialogLoading title="Phiếu cược — Max 3D Pro" />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Nội dung chi tiết thật — chỉ render khi `entry` đã fetch xong (xem `Max3dproEntryDetailDialog`). */
function Max3dproEntryDetailContent({ entry }: { entry: TicketEntryEntity }) {
  const tiers = entry.payout?.tiers ?? [];
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

  const resultSet = buildResultSet(entry.result);

  const tenantUsername = toTenantUsername(entry.username) ?? entry.username;
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
          Phiếu cược — Max 3D Pro
        </DialogTitle>
        <DialogDescription className="flex items-center gap-1.5 font-mono text-xs">
          <Ticket className="size-3 shrink-0 text-muted-foreground" />
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
                      <Link href={playerLink} className="cursor-pointer font-semibold hover:underline">
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
                {formatVN(new Date(entry.createdAt as unknown as string), "HH:mm dd/MM")}
              </span>
            </div>
          </div>

          {/* ── 3. Financial KPI strip ─────────────────────────────────── */}
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
                  <p className="text-[11px] text-muted-foreground">{REPORT_COLUMN_LABELS.totalCommission}</p>
                  <p className="text-sm font-bold tabular-nums">{formatNumber(entry.tenant.commissionAmount)}</p>
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

          {/* ── 4. Kết quả & Bộ số đã chọn ─────────────────────────────── */}
          {entry.result && !isScheduled && boards.length > 0 ? (
            <div className="rounded-lg border p-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Kết quả</p>
              <div className="mb-4 space-y-1.5">
                {(
                  [
                    { label: "Đặc Biệt", values: entry.result.special },
                    { label: "Giải Nhất", values: entry.result.first },
                    { label: "Giải Nhì", values: entry.result.second },
                    { label: "Giải Ba", values: entry.result.third },
                  ] as { label: string; values: string[] }[]
                ).map(({ label, values }) =>
                  values?.length ? (
                    <div key={label} className="flex flex-wrap items-center gap-1.5">
                      <span className="w-16 shrink-0 text-[11px] text-muted-foreground">{label}</span>
                      {values.map((t) => (
                        <TripletDisplay
                          key={t}
                          value={t}
                          size="sm"
                          variant={boards.some((b) => b.triplets.includes(t)) ? "matched" : "result"}
                        />
                      ))}
                    </div>
                  ) : null,
                )}
              </div>

              <div className="mb-3 border-t" />

              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Bộ số đã chọn
              </p>
              <div className="space-y-2">
                {boards.map((board, i) => {
                  const modeLabel = playModeLabel(board);
                  const boardColor = boardColorVar(board.boardNo);
                  return (
                    <div
                      key={i}
                      className="grid items-start gap-x-3 rounded-md border-l-[3px] py-2 pl-3 pr-2"
                      style={{
                        borderLeftColor: boardColor,
                        gridTemplateColumns: "2rem 5rem 1fr",
                      }}
                    >
                      <div className="flex items-center justify-center self-stretch">
                        <span className="text-sm font-extrabold leading-none" style={{ color: boardColor }}>
                          {board.boardNo}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 pt-0.5">
                        <span className="text-[11px] font-semibold leading-tight text-foreground">
                          {modeLabel ?? "Thường"}
                        </span>
                        <span className="text-[10px] leading-tight text-muted-foreground">
                          {formatNumber(board.lineCount)} cặp
                        </span>
                        {board.betCount > 1 && (
                          <span className="text-[10px] leading-tight text-muted-foreground/70">×{board.betCount}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {board.playMode === "multiDigit" && board.frontDigits && board.backDigits ? (
                          <>
                            {board.frontDigits.map((d, j) => (
                              <span
                                key={`f-${j}`}
                                className="inline-flex size-6 items-center justify-center rounded bg-muted font-mono text-[11px] font-bold tabular-nums text-muted-foreground"
                              >
                                {d}
                              </span>
                            ))}
                            <span className="select-none px-0.5 text-[10px] text-muted-foreground/40">×</span>
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
                          board.triplets.map((t, j) => (
                            <TripletDisplay
                              key={j}
                              value={t}
                              size="sm"
                              variant={resultSet.has(t) ? "matched" : "default"}
                            />
                          ))
                        )}
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
                    const modeLabel = playModeLabel(board);
                    const boardColor = boardColorVar(board.boardNo);
                    return (
                      <div
                        key={i}
                        className="grid items-start gap-x-3 rounded-md border-l-[3px] py-2 pl-3 pr-2"
                        style={{
                          borderLeftColor: boardColor,
                          gridTemplateColumns: "2rem 5rem 1fr",
                        }}
                      >
                        <div className="flex items-center justify-center self-stretch">
                          <span className="text-sm font-extrabold leading-none" style={{ color: boardColor }}>
                            {board.boardNo}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 pt-0.5">
                          <span className="text-[11px] font-semibold leading-tight text-foreground">
                            {modeLabel ?? "Thường"}
                          </span>
                          <span className="text-[10px] leading-tight text-muted-foreground">
                            {formatNumber(board.lineCount)} cặp
                          </span>
                          {board.betCount > 1 && (
                            <span className="text-[10px] leading-tight text-muted-foreground/70">
                              ×{board.betCount}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {board.playMode === "multiDigit" && board.frontDigits && board.backDigits ? (
                            <>
                              {board.frontDigits.map((d, j) => (
                                <span
                                  key={`f-${j}`}
                                  className="inline-flex size-6 items-center justify-center rounded bg-muted font-mono text-[11px] font-bold tabular-nums text-muted-foreground"
                                >
                                  {d}
                                </span>
                              ))}
                              <span className="select-none px-0.5 text-[10px] text-muted-foreground/40">×</span>
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
                            board.triplets.map((t, j) => (
                              <TripletDisplay key={j} value={t} size="sm" variant="default" />
                            ))
                          )}
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
                      (PRIZE_TIER_ORDER.indexOf(a.tier) + 1 || 999) - (PRIZE_TIER_ORDER.indexOf(b.tier) + 1 || 999),
                  )
                  .map((tier: EntryPayoutTier, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-md bg-background/60 px-3 py-1.5 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-medium">
                          {MAX3DPRO_PRIZE_LABELS[tier.tier] ?? tier.tier}
                        </Badge>
                        <span className="inline-flex items-center rounded-full bg-profit/15 px-2 py-0.5 text-[11px] font-bold tabular-nums text-profit">
                          ×{tier.hitCount} cặp
                        </span>
                      </div>
                      <span className="font-bold tabular-nums text-profit">{formatNumber(tier.amount)}</span>
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
