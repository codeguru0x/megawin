"use client";

/**
 * Mega 6/45 — Winning Entries Dialog
 *
 * Báo cáo kế toán toàn màn hình danh sách phiếu trúng thưởng.
 * Mega 6/45: không có specialNumbers — chỉ hiển thị numbers (01-45).
 */
import { useCallback, useMemo, useState } from "react";

import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { PrizeTier } from "@megawin/game-mega645/entities";
import { formatNumber, formatVN, toTenantUsername } from "@megawin/shared/utils";
import { Banknote, FileSearch, Hash, Loader2, Star, Trophy, Users } from "lucide-react";

import { MegaMatchBall } from "@/components/games/mega645/mega-number-ball";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { Mega645EntryDetailDialog } from "../../../../reports/settle/_lib/sections/entry-detail-dialog";
import {
  useWinningEntries,
  useWinningEntryDetail,
  WINNING_ENTRIES_PAGE_SIZE,
  type WinningEntryItem,
  type WinningEntryTierDetail,
} from "../../use-operations";

// ─── Tier config ──────────────────────────────────────────────────────────────

const TIER_STYLE: Partial<Record<PrizeTier, { badge: string; winColor: string }>> = {
  [PrizeTier.Jackpot]: {
    badge: "border-game-mega645/60 bg-game-mega645/10 text-game-mega645",
    winColor: "text-game-mega645",
  },
  [PrizeTier.Tier1]: {
    badge: "border-profit/60 bg-profit/10 text-profit",
    winColor: "text-profit",
  },
  [PrizeTier.Tier2]: {
    badge: "border-info/60 bg-info/10 text-info",
    winColor: "text-info",
  },
  [PrizeTier.Tier3]: {
    badge: "border-info/60 bg-info/10 text-info",
    winColor: "text-info",
  },
};

function TierChip({ tier }: { tier: WinningEntryTierDetail }) {
  const s = TIER_STYLE[tier.tier as PrizeTier];
  const isJackpot = tier.tier === PrizeTier.Jackpot;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
        s?.badge,
      )}
    >
      {isJackpot && <Star className="fill-game-mega645 text-game-mega645 size-3" />}
      {tier.tierLabel}
      {tier.hitCount > 1 && <span className="ml-0.5 font-bold">×{tier.hitCount}</span>}
    </span>
  );
}

// ─── Numbers — Mega 6/45: chỉ numbers ────────────────────────────────────

function EntryNumbers({ entry }: { entry: WinningEntryItem }) {
  if (entry.boards.length === 0) {
    return <span className="text-muted-foreground/40 text-sm">—</span>;
  }
  const winningSet = new Set(entry.winningNumbers);
  return (
    <div className="flex flex-col gap-1.5">
      {entry.boards.map((b) => (
        <div key={b.boardNo} className="flex items-start gap-1.5">
          <span className="text-muted-foreground/50 mt-1 w-4 shrink-0 text-xs font-medium tabular-nums">
            {b.boardNo}
          </span>
          <div className="flex max-w-80 flex-wrap items-center gap-0.5">
            {b.numbers.map((n) => (
              <MegaMatchBall key={n} n={n} size="sm" variant={winningSet.has(n) ? "matched" : "default"} />
            ))}
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
    <div className="bg-muted/20 flex shrink-0 gap-3 border-b px-6 py-3">
      <KpiCard
        icon={Users}
        iconBg="bg-info"
        iconColor="text-info"
        label={REPORT_COLUMN_LABELS.winningEntryCount}
        value={formatNumber(totalWinningEntries)}
      />
      <KpiCard
        icon={Hash}
        iconBg="bg-game-mega645"
        iconColor="text-game-mega645"
        label={REPORT_COLUMN_LABELS.winningLineCount}
        value={formatNumber(totalWinningLines)}
      />
      <KpiCard
        icon={Banknote}
        iconBg="bg-warning"
        iconColor="text-warning"
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
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useWinningEntries(drawId, open);
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
      <DialogContent
        className="flex flex-col gap-0 overflow-hidden rounded-2xl border p-0 shadow-2xl sm:max-w-none"
        style={{
          width: "calc(100vw - 2rem)",
          maxWidth: "1400px",
          height: "calc(100vh - 2rem)",
          maxHeight: "960px",
        }}
      >
        <div className="bg-background flex shrink-0 items-center justify-between gap-4 border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="bg-game-mega645/15 ring-game-mega645/30 flex size-10 shrink-0 items-center justify-center rounded-xl ring-1">
              <Trophy className="text-game-mega645 size-5" />
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
          <KpiBar
            totalWinningEntries={summary.totalWinningEntries}
            totalWinningLines={summary.totalWinningLines}
            totalWinAmount={summary.totalWinAmount}
          />
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
                <p className="text-muted-foreground mt-1 text-sm">Kỳ này không có bộ số nào trúng thưởng.</p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="hover:bg-muted/40">
                  <TableHead className="w-12 pl-6 text-center">STT</TableHead>
                  <TableHead className="w-44">{REPORT_COLUMN_LABELS.player}</TableHead>
                  <TableHead className="w-28 text-right">{REPORT_COLUMN_LABELS.totalStake}</TableHead>
                  <TableHead className="min-w-70">{REPORT_COLUMN_LABELS.numbersPlayed}</TableHead>
                  <TableHead className="w-52">{REPORT_COLUMN_LABELS.prizeTier}</TableHead>
                  <TableHead className="w-40 pr-6 text-right">{REPORT_COLUMN_LABELS.winAmount}</TableHead>
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

      <Mega645EntryDetailDialog
        entry={selectedEntry ?? null}
        open={!!selectedEntryId}
        onClose={() => setSelectedEntryId(null)}
      />
    </Dialog>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function WinningEntryRow({ entry, rowNo, onClick }: { entry: WinningEntryItem; rowNo: number; onClick: () => void }) {
  const displayName = toTenantUsername(entry.username) ?? entry.username;
  const hasJackpot = entry.tiers.some((t) => t.tier === PrizeTier.Jackpot && t.hitCount > 0);

  return (
    <TableRow
      onClick={onClick}
      className={cn(
        "group hover:bg-muted/30 cursor-pointer align-top transition-colors",
        // Entry trúng Jackpot: chỉ dùng border trái mảnh làm chỉ báo — nền phẳng để
        // bảng đồng nhất, tránh nền loang gây khó quét mắt. Icon nhận biết JP nằm trong chip Hạng trúng.
        hasJackpot && "border-l-3 border-l-game-mega645",
      )}
    >
      <TableCell className="py-3 pl-6 text-center">
        <span
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
            hasJackpot ? "bg-game-mega645/10 text-game-mega645" : "bg-muted text-muted-foreground",
          )}
        >
          {rowNo}
        </span>
      </TableCell>
      <TableCell className="py-3">
        <p className="text-foreground text-sm">{displayName}</p>
        <p className="text-muted-foreground/50 mt-0.5 max-w-32 truncate font-mono text-xs">@{entry.tenantId}</p>
      </TableCell>
      <TableCell className="py-3 text-right">
        <span className="text-foreground text-sm tabular-nums">{formatNumber(entry.amount)}</span>
        <p className="text-muted-foreground/50 mt-0.5 text-xs">{entry.lineCount} lines</p>
      </TableCell>
      <TableCell className="py-3">
        <EntryNumbers entry={entry} />
      </TableCell>
      <TableCell className="py-3">
        <div className="flex flex-col gap-1">
          {entry.tiers.map((t) => (
            <div key={t.tier} className="flex items-center gap-2">
              <TierChip tier={t} />
              <span className={cn("text-xs tabular-nums", TIER_STYLE[t.tier as PrizeTier]?.winColor)}>
                +{formatNumber(t.amount)}
              </span>
            </div>
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
