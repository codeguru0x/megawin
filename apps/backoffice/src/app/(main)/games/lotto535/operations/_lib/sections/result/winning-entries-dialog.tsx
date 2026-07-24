"use client";

/**
 * Lotto 5/35 — Winning Entries Dialog
 *
 * Báo cáo kế toán toàn màn hình danh sách phiếu trúng thưởng.
 * Design: casino accounting report — dark header, số lớn, bảng cực rộng.
 */

import { useCallback, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LottoMatchBall } from "@/components/games/lotto535/lotto-number-ball";
import { formatNumber, formatVN } from "@megawin/shared/utils";
import { toTenantUsername } from "@megawin/shared/utils";
import { PrizeTier } from "@megawin/game-lotto535/entities";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { Trophy, Star, Loader2, FileSearch, Users, Hash, Banknote } from "lucide-react";
import {
  useWinningEntries,
  useWinningEntryDetail,
  WINNING_ENTRIES_PAGE_SIZE,
} from "../../use-operations";
import type { WinningEntryItem, WinningEntryTierDetail } from "../../use-operations";
import { Lotto535EntryDetailDialog } from "../../../../reports/settle/_lib/sections/entry-detail-dialog";

// ─── Tier config ──────────────────────────────────────────────────────────────

const TIER_STYLE: Partial<Record<PrizeTier, { badge: string; winColor: string }>> = {
  [PrizeTier.Jackpot]: {
    badge:
      "border-amber-400/60 bg-amber-500/10 text-amber-600 dark:text-amber-400 dark:border-amber-500/50",
    winColor: "text-amber-500 dark:text-amber-400",
  },
  [PrizeTier.Tier1]: {
    badge:
      "border-yellow-400/60 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 dark:border-yellow-500/50",
    winColor: "text-yellow-600 dark:text-yellow-400",
  },
  [PrizeTier.Tier2]: {
    badge:
      "border-orange-400/60 bg-orange-500/10 text-orange-700 dark:text-orange-400 dark:border-orange-500/50",
    winColor: "text-orange-600 dark:text-orange-400",
  },
  [PrizeTier.Tier3]: {
    badge:
      "border-blue-400/60 bg-blue-500/10 text-blue-700 dark:text-blue-400 dark:border-blue-500/50",
    winColor: "text-blue-600 dark:text-blue-400",
  },
  [PrizeTier.Tier4]: {
    badge:
      "border-indigo-400/60 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 dark:border-indigo-500/50",
    winColor: "text-indigo-600 dark:text-indigo-400",
  },
  [PrizeTier.Tier5]: {
    badge:
      "border-violet-400/60 bg-violet-500/10 text-violet-700 dark:text-violet-400 dark:border-violet-500/50",
    winColor: "text-violet-600 dark:text-violet-400",
  },
  [PrizeTier.Consolation]: {
    badge: "border-border bg-muted/40 text-muted-foreground",
    winColor: "text-muted-foreground",
  },
};

function TierChip({ tier }: { tier: WinningEntryTierDetail }) {
  const s = TIER_STYLE[tier.tier as PrizeTier];
  const isJackpot = tier.tier === PrizeTier.Jackpot;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium shrink-0",
        s?.badge,
      )}
    >
      {isJackpot && <Star className="size-3 fill-amber-500 text-amber-500" />}
      {tier.tierLabel}
      {tier.hitCount > 1 && <span className="ml-0.5 font-bold">×{tier.hitCount}</span>}
    </span>
  );
}

// ─── Numbers ──────────────────────────────────────────────────────────────────

function EntryNumbers({ entry }: { entry: WinningEntryItem }) {
  if (entry.boards.length === 0) return <span className="text-muted-foreground/40 text-sm">—</span>;
  const winningMainSet = new Set(entry.winningMain);
  const winningSpecial = entry.winningSpecial;
  return (
    <div className="flex flex-col gap-1.5">
      {entry.boards.map((b) => (
        <div key={b.boardNo} className="flex items-start gap-1.5">
          <span className="text-xs font-medium text-muted-foreground/50 w-4 shrink-0 mt-1 tabular-nums">
            {b.boardNo}
          </span>
          <div className="flex items-center gap-0.5 flex-wrap max-w-80">
            {b.mainNumbers.map((n) => (
              <LottoMatchBall
                key={n}
                n={n}
                size="sm"
                variant={winningMainSet.has(n) ? "matched" : "default"}
              />
            ))}
            {b.specialNumbers.length > 0 && (
              <>
                <div className="w-px h-4 bg-border/40 mx-0.5 shrink-0" />
                {b.specialNumbers.map((n) => (
                  <LottoMatchBall
                    key={n}
                    n={n}
                    size="sm"
                    variant={winningSpecial && n === winningSpecial ? "special-matched" : "special"}
                    title="Số đặc biệt"
                  />
                ))}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

/**
 * KPI card đồng bộ với KPI Strip của trang Operations (operations-page-ui.mdc §10).
 * rounded-xl border bg-card shadow-sm · icon size-10 rounded-lg nền đặc · value text-lg font-bold.
 */
function KpiCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm flex-1 min-w-0">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
        <p className="text-lg font-bold tabular-nums text-foreground leading-tight">{value}</p>
      </div>
    </div>
  );
}

function KpiBar({
  totalWinningEntries,
  totalWinningLines,
  totalWinAmount,
}: {
  totalWinningEntries: number;
  totalWinningLines: number;
  totalWinAmount: number;
}) {
  return (
    <div className="flex gap-3 border-b bg-muted/20 px-6 py-3 shrink-0">
      <KpiCard
        icon={Users}
        iconBg="bg-blue-100 dark:bg-blue-900/50"
        iconColor="text-blue-600 dark:text-blue-400"
        label={REPORT_COLUMN_LABELS.winningEntryCount}
        value={formatNumber(totalWinningEntries)}
      />
      <KpiCard
        icon={Hash}
        iconBg="bg-emerald-100 dark:bg-emerald-900/50"
        iconColor="text-emerald-600 dark:text-emerald-400"
        label={REPORT_COLUMN_LABELS.winningLineCount}
        value={formatNumber(totalWinningLines)}
      />
      <KpiCard
        icon={Banknote}
        iconBg="bg-amber-100 dark:bg-amber-900/50"
        iconColor="text-amber-600 dark:text-amber-400"
        label={REPORT_COLUMN_LABELS.totalWinningPayout}
        value={formatNumber(totalWinAmount)}
      />
    </div>
  );
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

interface WinningEntriesDialogProps {
  drawId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WinningEntriesDialog({ drawId, open, onOpenChange }: WinningEntriesDialogProps) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useWinningEntries(
    drawId,
    open,
  );
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const { data: selectedEntry } = useWinningEntryDetail(selectedEntryId, {
    onNotFound: () => setSelectedEntryId(null),
  });

  const handleOpenChange = useCallback(
    (o: boolean) => {
      onOpenChange(o);
    },
    [onOpenChange],
  );

  // Gộp entries từ tất cả trang đã load — KPI (summary) lấy từ trang đầu, độc lập
  // với số trang đã load vì backend tính bằng aggregate riêng quét toàn bộ kỳ.
  const entries = useMemo(() => data?.pages.flatMap((p) => p.entries) ?? [], [data]);
  const summary = data?.pages[0]?.summary;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Full-screen on desktop, full-height modal */}
      <DialogContent
        className="flex flex-col p-0 gap-0 overflow-hidden rounded-2xl shadow-2xl sm:max-w-none border"
        style={{
          width: "calc(100vw - 2rem)",
          maxWidth: "1400px",
          height: "calc(100vh - 2rem)",
          maxHeight: "960px",
        }}
      >
        {/* ── Top header bar ── */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b bg-background shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/30 shrink-0">
              <Trophy className="size-5 text-amber-500" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold tracking-tight">
                Danh sách trúng thưởng
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Kỳ <span className="font-mono text-foreground">{drawId}</span>
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* ── KPI bar ── */}
        {summary && (
          <KpiBar
            totalWinningEntries={summary.totalWinningEntries}
            totalWinningLines={summary.totalWinningLines}
            totalWinAmount={summary.totalWinAmount}
          />
        )}

        {/* ── Table area ── */}
        <div className="flex-1 overflow-auto min-h-0">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Đang tải dữ liệu...</p>
              </div>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/50">
                <FileSearch className="size-7 text-muted-foreground/40" />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-foreground">
                  Không có phiếu trúng thưởng
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Kỳ này không có bộ số nào trúng thưởng.
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="hover:bg-muted/40">
                  <TableHead className="pl-6 w-12 text-center">STT</TableHead>
                  <TableHead className="w-44">{REPORT_COLUMN_LABELS.player}</TableHead>
                  <TableHead className="w-28 text-right">
                    {REPORT_COLUMN_LABELS.totalStake}
                  </TableHead>
                  <TableHead className="min-w-70">{REPORT_COLUMN_LABELS.numbersPlayed}</TableHead>
                  <TableHead className="w-52">{REPORT_COLUMN_LABELS.prizeTier}</TableHead>
                  <TableHead className="pr-6 w-40 text-right">
                    {REPORT_COLUMN_LABELS.winAmount}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry, idx) => (
                  <WinningEntryRow
                    key={entry.entryId}
                    entry={entry}
                    rowNo={idx + 1}
                    onClick={() => setSelectedEntryId(entry.entryId)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* ── Footer ── */}
        {entries.length > 0 && (
          <div className="shrink-0 border-t bg-muted/20 px-6 py-2.5 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Hiển thị {formatNumber(entries.length)}
              {summary && ` / ${formatNumber(summary.totalWinningEntries)}`} phiếu trúng
            </span>
            {hasNextPage && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={isFetchingNextPage}
                onClick={() => fetchNextPage()}
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Đang tải…
                  </>
                ) : (
                  `Tải thêm ${WINNING_ENTRIES_PAGE_SIZE}`
                )}
              </Button>
            )}
          </div>
        )}
      </DialogContent>

      <Lotto535EntryDetailDialog
        entry={selectedEntry ?? null}
        open={!!selectedEntryId}
        onClose={() => setSelectedEntryId(null)}
      />
    </Dialog>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function WinningEntryRow({
  entry,
  rowNo,
  onClick,
}: {
  entry: WinningEntryItem;
  rowNo: number;
  onClick: () => void;
}) {
  const displayName = toTenantUsername(entry.username) ?? entry.username;
  const hasJackpot = entry.tiers.some((t) => t.tier === PrizeTier.Jackpot && t.hitCount > 0);

  return (
    <TableRow
      onClick={onClick}
      className={cn(
        "align-top group transition-colors hover:bg-muted/30 cursor-pointer",
        // Entry trúng Jackpot: chỉ dùng border trái mảnh làm chỉ báo — nền phẳng để
        // bảng đồng nhất, tránh nền loang gây khó quét mắt. Icon nhận biết JP nằm trong chip Hạng trúng.
        hasJackpot && "border-l-[3px] border-l-amber-400",
      )}
    >
      {/* Row number */}
      <TableCell className="pl-6 py-3 text-center">
        <span
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
            hasJackpot
              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          {rowNo}
        </span>
      </TableCell>

      {/* Player */}
      <TableCell className="py-3">
        <p className="text-sm text-foreground">{displayName}</p>
        <p className="text-xs text-muted-foreground/50 font-mono mt-0.5 truncate max-w-32">
          @{entry.tenantId}
        </p>
      </TableCell>

      {/* Bet amount */}
      <TableCell className="py-3 text-right">
        <span className="text-sm tabular-nums text-foreground">{formatNumber(entry.amount)}</span>
        <p className="text-xs text-muted-foreground/50 mt-0.5">{entry.lineCount} lines</p>
      </TableCell>

      {/* Numbers */}
      <TableCell className="py-3">
        <EntryNumbers entry={entry} />
      </TableCell>

      {/* Winning tiers */}
      <TableCell className="py-3">
        <div className="flex flex-col gap-1">
          {entry.tiers.map((t) => (
            <div key={t.tier} className="flex items-center gap-2">
              <TierChip tier={t} />
              <span
                className={cn("text-xs tabular-nums", TIER_STYLE[t.tier as PrizeTier]?.winColor)}
              >
                +{formatNumber(t.amount)}
              </span>
            </div>
          ))}
        </div>
      </TableCell>

      {/* Win amount */}
      <TableCell className="py-3 pr-6 text-right">
        <p className="text-sm tabular-nums text-foreground font-medium">
          {formatNumber(entry.winAmount)}
        </p>
        <p className="text-xs text-muted-foreground/50 tabular-nums mt-0.5">
          {formatVN(new Date(entry.createdAt), "HH:mm dd/MM")}
        </p>
      </TableCell>
    </TableRow>
  );
}
