"use client";

import type { CSSProperties } from "react";

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
  if (!result) {
    return new Set();
  }
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
            <span className="bg-destructive/15 inline-flex items-center justify-center rounded-full p-1">
              <XCircle className="text-destructive size-5 shrink-0" />
            </span>
          ) : (
            <span className="inline-flex items-center justify-center rounded-full bg-amber-500/15 p-1">
              <Timer className="size-5 shrink-0 text-amber-500" />
            </span>
          )}
          Phiếu cược — Max 3D Pro
        </DialogTitle>
        <DialogDescription className="flex items-center gap-1.5 font-mono text-xs">
          <Ticket className="text-muted-foreground size-3 shrink-0" />
          {entry.entrySummary.ticketNo} · {entry.drawId}
        </DialogDescription>
      </DialogHeader>

      <ScrollArea className="max-h-[76vh]">
        <div className="space-y-4 pr-2">
          {/* ── 1. Metadata strip 2-column ─────────────────────────────── */}
          <div className="bg-muted/50 grid grid-cols-2 gap-x-8 gap-y-1.5 rounded-lg px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-2xs flex items-center gap-1.5">
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
              <span className="text-muted-foreground text-2xs flex items-center gap-1.5">
                <Layers className="size-3.5 shrink-0" />
                Cặp số
              </span>
              <span className="font-semibold tabular-nums">{formatNumber(entry.lineCount)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-2xs flex items-center gap-1.5">
                <Building2 className="size-3.5 shrink-0" />
                Đại lý
              </span>
              <span className="font-semibold">{(entry as any).tenantId ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-2xs flex items-center gap-1.5">
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
              <div className="bg-muted/50 flex items-center gap-3 rounded-lg p-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-900/50">
                  <Banknote className="size-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-muted-foreground text-2xs flex items-center gap-1.5">
                    Tiền cược
                    {entry.betUnitCount > 1 && (
                      <span className="bg-muted text-muted-foreground text-3xs rounded px-1 py-px font-medium">
                        ×{formatNumber(entry.betUnitCount)}
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
                  <p className="text-muted-foreground text-2xs">{REPORT_COLUMN_LABELS.totalCommission}</p>
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
                  <p className="text-muted-foreground text-2xs flex items-center gap-1.5">
                    Tiền cược
                    {entry.betUnitCount > 1 && (
                      <span className="bg-muted text-muted-foreground text-3xs rounded px-1 py-px font-medium">
                        ×{formatNumber(entry.betUnitCount)}
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
                  <p className="text-muted-foreground text-2xs">{REPORT_COLUMN_LABELS.totalPayout}</p>
                  <p className="text-sm font-bold tabular-nums">{formatNumber(entry.payout?.payoutAmount ?? 0)}</p>
                </div>
              </div>
              <div className="bg-muted/50 flex items-center gap-3 rounded-lg p-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900/50">
                  <HandCoins className="size-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-muted-foreground text-2xs">{REPORT_COLUMN_LABELS.totalCommission}</p>
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
                    <p className="text-muted-foreground text-2xs">{REPORT_COLUMN_LABELS.playerNetProfit}</p>
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
              <p className="text-muted-foreground text-2xs mb-2 font-medium tracking-wide uppercase">Kết quả</p>
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
                      <span className="text-muted-foreground text-2xs w-16 shrink-0">{label}</span>
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

              <p className="text-muted-foreground text-2xs mb-2 font-medium tracking-wide uppercase">Bộ số đã chọn</p>
              <div className="space-y-2">
                {boards.map((board, i) => {
                  const modeLabel = playModeLabel(board);
                  const boardColor = boardColorVar(board.boardNo);
                  return (
                    <div
                      key={i}
                      className="grid [grid-template-columns:2rem_5rem_1fr] items-start gap-x-3 rounded-md border-l-3 border-l-(--board-color) py-2 pr-2 pl-3"
                      style={{ "--board-color": boardColor } as CSSProperties}
                    >
                      <div className="flex items-center justify-center self-stretch">
                        <span className="text-sm leading-none font-extrabold text-(--board-color)">
                          {board.boardNo}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 pt-0.5">
                        <span className="text-foreground text-2xs leading-tight font-semibold">
                          {modeLabel ?? "Thường"}
                        </span>
                        <span className="text-muted-foreground text-3xs leading-tight">
                          {formatNumber(board.lineCount)} cặp
                        </span>
                        {board.betCount > 1 && (
                          <span className="text-muted-foreground/70 text-3xs leading-tight">×{board.betCount}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {board.playMode === "multiDigit" && board.frontDigits && board.backDigits ? (
                          <>
                            {board.frontDigits.map((d, j) => (
                              <span
                                key={`f-${j}`}
                                className="bg-muted text-muted-foreground text-2xs inline-flex size-6 items-center justify-center rounded font-mono font-bold tabular-nums"
                              >
                                {d}
                              </span>
                            ))}
                            <span className="text-muted-foreground/40 text-3xs px-0.5 select-none">×</span>
                            {board.backDigits.map((d, j) => (
                              <span
                                key={`b-${j}`}
                                className="bg-muted text-muted-foreground text-2xs inline-flex size-6 items-center justify-center rounded font-mono font-bold tabular-nums"
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
                <p className="text-muted-foreground text-2xs mb-3 font-medium tracking-wide uppercase">Bộ số đã chọn</p>
                <div className="space-y-2">
                  {boards.map((board, i) => {
                    const modeLabel = playModeLabel(board);
                    const boardColor = boardColorVar(board.boardNo);
                    return (
                      <div
                        key={i}
                        className="grid [grid-template-columns:2rem_5rem_1fr] items-start gap-x-3 rounded-md border-l-3 border-l-(--board-color) py-2 pr-2 pl-3"
                        style={{ "--board-color": boardColor } as CSSProperties}
                      >
                        <div className="flex items-center justify-center self-stretch">
                          <span className="text-sm leading-none font-extrabold text-(--board-color)">
                            {board.boardNo}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 pt-0.5">
                          <span className="text-foreground text-2xs leading-tight font-semibold">
                            {modeLabel ?? "Thường"}
                          </span>
                          <span className="text-muted-foreground text-3xs leading-tight">
                            {formatNumber(board.lineCount)} cặp
                          </span>
                          {board.betCount > 1 && (
                            <span className="text-muted-foreground/70 text-3xs leading-tight">×{board.betCount}</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {board.playMode === "multiDigit" && board.frontDigits && board.backDigits ? (
                            <>
                              {board.frontDigits.map((d, j) => (
                                <span
                                  key={`f-${j}`}
                                  className="bg-muted text-muted-foreground text-2xs inline-flex size-6 items-center justify-center rounded font-mono font-bold tabular-nums"
                                >
                                  {d}
                                </span>
                              ))}
                              <span className="text-muted-foreground/40 text-3xs px-0.5 select-none">×</span>
                              {board.backDigits.map((d, j) => (
                                <span
                                  key={`b-${j}`}
                                  className="bg-muted text-muted-foreground text-2xs inline-flex size-6 items-center justify-center rounded font-mono font-bold tabular-nums"
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
            <div className="border-profit/30 bg-profit/5 rounded-lg border p-4">
              <p className="text-profit text-2xs mb-3 font-medium tracking-wide uppercase">Giải trúng</p>
              <div className="space-y-2">
                {[...tiers]
                  .sort(
                    (a, b) =>
                      (PRIZE_TIER_ORDER.indexOf(a.tier) + 1 || 999) - (PRIZE_TIER_ORDER.indexOf(b.tier) + 1 || 999),
                  )
                  .map((tier: EntryPayoutTier, i: number) => (
                    <div
                      key={i}
                      className="bg-background/60 flex items-center justify-between rounded-md px-3 py-1.5 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{MAX3DPRO_PRIZE_LABELS[tier.tier] ?? tier.tier}</Badge>
                        <span className="bg-profit/15 text-profit text-2xs inline-flex items-center rounded-full px-2 py-0.5 font-bold tabular-nums">
                          ×{tier.hitCount} cặp
                        </span>
                      </div>
                      <span className="text-profit font-bold tabular-nums">{formatNumber(tier.amount)}</span>
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
