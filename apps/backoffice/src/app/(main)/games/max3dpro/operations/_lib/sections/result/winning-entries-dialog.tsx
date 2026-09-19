"use client";

/**
 * Max 3D Pro — Winning Entries Dialog
 *
 * Báo cáo phiếu trúng thưởng Max 3D Pro.
 * Max 3D Pro đặc thù:
 * - boards[].triplets: danh sách bộ ba (multiNumber: 3-20 bộ, multiDigit: expand từ frontDigits × backDigits).
 * - playMode: multiNumber / multiDigit.
 * - playType: straight.
 * - 8 PrizeTier (special, specialSub, first-sixth).
 * - isDuplicate: 2 bộ ba giống nhau → giải thưởng × 2.
 */
import { useCallback, useMemo, useState } from "react";

import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { PrizeTier } from "@megawin/game-max3dpro/entities";
import { MAX3DPRO_PLAY_MODE_LABELS, MAX3DPRO_PRIZE_TIER_LABELS } from "@megawin/game-max3dpro/labels";
import { formatNumber, formatVN, toTenantUsername } from "@megawin/shared/utils";
import { Banknote, FileSearch, Loader2, Trophy, Users } from "lucide-react";

import { TripletDisplay } from "@/components/games/max3dpro/triplet-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { Max3dproEntryDetailDialog } from "../../../../reports/settle/_lib/sections/entry-detail-dialog";
import {
  useWinningEntries,
  useWinningEntryDetail,
  WINNING_ENTRIES_PAGE_SIZE,
  type WinningEntryItem,
} from "../../use-operations";

// ─── Board chip ───────────────────────────────────────────────────────────────

function BoardChip({ board, winningSet }: { board: WinningEntryItem["boards"][number]; winningSet: Set<string> }) {
  const modeLabel =
    MAX3DPRO_PLAY_MODE_LABELS[board.playMode as keyof typeof MAX3DPRO_PLAY_MODE_LABELS] ?? board.playMode;

  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground/50 text-3xs mt-0.5 w-4 shrink-0 font-medium tabular-nums">
        {board.boardNo}
      </span>
      <div className="flex flex-col gap-0.5">
        <div className="flex max-w-65 flex-wrap items-center gap-1">
          {board.triplets.map((t, i) => (
            <TripletDisplay key={i} value={t} variant={winningSet.has(t) ? "matched" : "default"} size="sm" />
          ))}
        </div>
        <span className="text-3xs font-medium text-orange-600 dark:text-orange-400">
          {modeLabel}
          {board.isDuplicate && <span className="ml-1 text-amber-600">(ĐB)</span>}
          {" · "}
          {board.lineCount} cặp
        </span>
      </div>
    </div>
  );
}

// ─── Tier badge colors ────────────────────────────────────────────────────────

const TIER_BADGE_COLORS: Partial<Record<PrizeTier, string>> = {
  [PrizeTier.Special]:
    "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700",
  [PrizeTier.SpecialSub]:
    "border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-700",
  [PrizeTier.First]:
    "border-yellow-300 bg-yellow-50 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300 dark:border-yellow-700",
  [PrizeTier.Second]:
    "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-700",
  [PrizeTier.Third]:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-700",
};

function TierChip({ tier }: { tier: WinningEntryItem["tiers"][number] }) {
  const label = MAX3DPRO_PRIZE_TIER_LABELS[tier.tier as PrizeTier] ?? tier.tier;
  const badgeClass = TIER_BADGE_COLORS[tier.tier as PrizeTier] ?? "border-border bg-muted/40 text-muted-foreground";

  return (
    <div className="flex items-center gap-1.5">
      <Badge variant="outline" className={cn("text-3xs h-4 py-0", badgeClass)}>
        {label}
      </Badge>
      <span className="text-xs text-amber-700 tabular-nums dark:text-amber-400">+{formatNumber(tier.amount)}</span>
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
    <div className="bg-card flex min-w-0 flex-1 items-center gap-3 rounded-xl border p-4 shadow-sm">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground truncate text-xs font-medium">{label}</p>
        <p className="text-foreground text-lg leading-tight font-bold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function KpiBar({ totalWinningEntries, totalWinAmount }: { totalWinningEntries: number; totalWinAmount: number }) {
  return (
    <div className="bg-muted/20 flex shrink-0 gap-3 border-b px-6 py-3">
      <KpiCard
        icon={Users}
        iconBg="bg-blue-100 dark:bg-blue-900/50"
        iconColor="text-blue-600 dark:text-blue-400"
        label={REPORT_COLUMN_LABELS.winningEntryCount}
        value={formatNumber(totalWinningEntries)}
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

// ─── Row ──────────────────────────────────────────────────────────────────────

function WinningEntryRow({ entry, rowNo, onClick }: { entry: WinningEntryItem; rowNo: number; onClick: () => void }) {
  const displayName = toTenantUsername(entry.username) ?? entry.username;
  const winningSet = new Set(entry.winningTriplets);

  return (
    <TableRow onClick={onClick} className="group hover:bg-muted/30 cursor-pointer align-top transition-colors">
      <TableCell className="py-3 pl-6 text-center">
        <span className="bg-muted text-muted-foreground inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums">
          {rowNo}
        </span>
      </TableCell>
      <TableCell className="py-3">
        <div>
          <p className="text-foreground text-sm">{displayName}</p>
          <p className="text-muted-foreground/50 text-3xs mt-0.5 max-w-32 truncate font-mono">@{entry.tenantId}</p>
        </div>
      </TableCell>
      <TableCell className="py-3 text-right">
        <span className="text-foreground text-sm tabular-nums">{formatNumber(entry.amount)}</span>
      </TableCell>
      <TableCell className="py-3">
        <div className="flex flex-col gap-1.5">
          {entry.boards.map((b, i) => (
            <BoardChip key={i} board={b} winningSet={winningSet} />
          ))}
        </div>
      </TableCell>
      <TableCell className="py-3">
        <div className="flex flex-col gap-1">
          {entry.tiers.map((t, i) => (
            <TierChip key={i} tier={t} />
          ))}
        </div>
      </TableCell>
      <TableCell className="py-3 pr-6 text-right">
        <p className="text-foreground text-sm font-medium tabular-nums">{formatNumber(entry.winAmount)}</p>
        <p className="text-muted-foreground/50 mt-0.5 text-xs tabular-nums">
          {formatVN(new Date(entry.createdAt), "HH:mm dd/MM")}
        </p>
      </TableCell>
    </TableRow>
  );
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

interface WinningEntriesDialogProps {
  drawId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WinningEntriesDialog({ drawId, open, onOpenChange }: WinningEntriesDialogProps) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useWinningEntries(drawId, open);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const { data: selectedEntry } = useWinningEntryDetail(selectedEntryId, {
    onNotFound: () => setSelectedEntryId(null),
  });
  const handleOpenChange = useCallback((o: boolean) => onOpenChange(o), [onOpenChange]);

  // Gộp entries từ tất cả trang đã load — KPI (summary) lấy từ trang đầu, độc lập
  // với số trang đã load vì backend tính bằng aggregate riêng quét toàn bộ kỳ.
  const entries = useMemo(() => data?.pages.flatMap((p) => p.entries) ?? [], [data]);
  const summary = data?.pages[0]?.summary;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-[calc(100vh-2rem)] max-h-[960px] w-[calc(100vw-2rem)] max-w-[1400px] flex-col gap-0 overflow-hidden rounded-2xl border p-0 shadow-2xl sm:max-w-none">
        <div className="bg-background flex shrink-0 items-center justify-between gap-4 border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/15 ring-1 ring-orange-500/30">
              <Trophy className="size-5 text-orange-500" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold tracking-tight">Danh sách trúng thưởng</DialogTitle>
              <DialogDescription className="text-muted-foreground mt-0.5 text-xs">
                Kỳ <span className="text-foreground font-mono">{drawId}</span>
              </DialogDescription>
            </div>
          </div>
        </div>

        {summary && (
          <KpiBar totalWinningEntries={summary.totalWinningEntries} totalWinAmount={summary.totalWinAmount} />
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="text-muted-foreground size-8 animate-spin" />
                <p className="text-muted-foreground text-sm">Đang tải dữ liệu...</p>
              </div>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <div className="bg-muted/50 flex size-16 items-center justify-center rounded-2xl">
                <FileSearch className="text-muted-foreground/40 size-7" />
              </div>
              <div className="text-center">
                <p className="text-foreground text-base font-semibold">Không có phiếu trúng thưởng</p>
                <p className="text-muted-foreground mt-1 text-sm">Kỳ này không có phiếu cược nào trúng thưởng.</p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="hover:bg-muted/40">
                  <TableHead className="w-12 pl-6 text-center">STT</TableHead>
                  <TableHead className="w-44">{REPORT_COLUMN_LABELS.player}</TableHead>
                  <TableHead className="w-28 text-right">{REPORT_COLUMN_LABELS.totalStake}</TableHead>
                  <TableHead className="min-w-65">{REPORT_COLUMN_LABELS.tripletsPlayed}</TableHead>
                  <TableHead className="w-48">{REPORT_COLUMN_LABELS.prizeTier}</TableHead>
                  <TableHead className="w-40 pr-6 text-right">{REPORT_COLUMN_LABELS.winAmount}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry: WinningEntryItem, idx: number) => (
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

        {entries.length > 0 && (
          <div className="bg-muted/20 flex shrink-0 items-center justify-between gap-2 border-t px-6 py-2.5">
            <span className="text-muted-foreground text-xs">
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

      <Max3dproEntryDetailDialog
        entry={selectedEntry ?? null}
        open={!!selectedEntryId}
        onClose={() => setSelectedEntryId(null)}
      />
    </Dialog>
  );
}
