"use client";

/**
 * Power 6/55 — Winning Entries Dialog
 *
 * Báo cáo kế toán toàn màn hình danh sách entries trúng thưởng.
 * Power 6/55: có mainNumbers (01-55) + bonusNumber.
 */

import { useCallback } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PowerNumberBall } from "@/components/games/power655/power-number-ball";
import { formatNumber, displayVNDateTime } from "@megawin/shared/utils";
import { toTenantUsername } from "@megawin/shared/utils";
import { PrizeTier } from "@megawin/game-power655/entities";
import { Trophy, Gem, Star, Loader2, FileSearch, Users, Hash, Banknote, Zap } from "lucide-react";
import { useWinningEntries } from "../../use-operations";
import type { WinningEntryItem, WinningEntryTierDetail } from "../../use-operations";

// ─── Tier config ──────────────────────────────────────────────────────────────

const TIER_STYLE: Partial<Record<PrizeTier, { badge: string; winColor: string }>> = {
  [PrizeTier.Jackpot1]: {
    badge:
      "border-purple-400/60 bg-purple-500/10 text-purple-600 dark:text-purple-400 dark:border-purple-500/50",
    winColor: "text-purple-500 dark:text-purple-400",
  },
  [PrizeTier.Jackpot2]: {
    badge:
      "border-indigo-400/60 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 dark:border-indigo-500/50",
    winColor: "text-indigo-500 dark:text-indigo-400",
  },
  [PrizeTier.Tier1]: {
    badge:
      "border-emerald-400/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 dark:border-emerald-500/50",
    winColor: "text-emerald-600 dark:text-emerald-400",
  },
  [PrizeTier.Tier2]: {
    badge:
      "border-cyan-400/60 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 dark:border-cyan-500/50",
    winColor: "text-cyan-600 dark:text-cyan-400",
  },
  [PrizeTier.Tier3]: {
    badge:
      "border-blue-400/60 bg-blue-500/10 text-blue-700 dark:text-blue-400 dark:border-blue-500/50",
    winColor: "text-blue-600 dark:text-blue-400",
  },
};

function TierChip({ tier }: { tier: WinningEntryTierDetail }) {
  const s = TIER_STYLE[tier.tier as PrizeTier];
  const isJp1 = tier.tier === PrizeTier.Jackpot1;
  const isJp2 = tier.tier === PrizeTier.Jackpot2;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium shrink-0",
        s?.badge,
      )}
    >
      {isJp1 && <Star className="size-3 fill-purple-500 text-purple-500" />}
      {isJp2 && <Zap className="size-3 text-indigo-500" />}
      {tier.tierLabel}
      {tier.hitCount > 1 && <span className="ml-0.5 font-bold">×{tier.hitCount}</span>}
    </span>
  );
}

// ─── Numbers — Power 6/55: mainNumbers + optional bonusNumber per board ───────

function EntryNumbers({ entry }: { entry: WinningEntryItem }) {
  if (entry.boards.length === 0) return <span className="text-muted-foreground/40 text-sm">—</span>;
  return (
    <div className="flex flex-col gap-1.5">
      {entry.boards.map((b) => (
        <div key={b.boardNo} className="flex items-start gap-1.5">
          <span className="text-[10px] font-medium text-muted-foreground/50 w-4 shrink-0 mt-1 tabular-nums">
            {b.boardNo}
          </span>
          <div className="flex items-center gap-0.5 flex-wrap max-w-[360px]">
            {b.mainNumbers.map((n) => (
              <PowerNumberBall key={n} number={Number(n)} size="sm" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── KPI bar ──────────────────────────────────────────────────────────────────

function KpiBar({
  drawId,
  totalWinningEntries,
  totalWinningLines,
  totalWinAmount,
}: {
  drawId: string;
  totalWinningEntries: number;
  totalWinningLines: number;
  totalWinAmount: number;
}) {
  return (
    <div className="flex items-stretch divide-x divide-border/40 border-b bg-muted/20 shrink-0">
      <div className="flex flex-col justify-center px-6 py-3 w-44 shrink-0">
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          Kỳ quay
        </p>
        <p className="font-mono text-sm font-semibold text-foreground tracking-tight mt-0.5">
          {drawId}
        </p>
      </div>
      <div className="flex flex-1 items-center gap-3 px-6 py-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20 shrink-0">
          <Users className="size-4 text-blue-500" />
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Entries trúng
          </p>
          <p className="text-xl font-semibold tabular-nums text-foreground leading-tight mt-0.5">
            {formatNumber(totalWinningEntries)}
          </p>
        </div>
      </div>
      <div className="flex flex-1 items-center gap-3 px-6 py-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-purple-500/10 border border-purple-500/20 shrink-0">
          <Hash className="size-4 text-purple-500" />
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Lines trúng
          </p>
          <p className="text-xl font-semibold tabular-nums text-foreground leading-tight mt-0.5">
            {formatNumber(totalWinningLines)}
          </p>
        </div>
      </div>
      <div className="flex flex-1 items-center gap-3 px-6 py-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/15 border border-amber-500/30 shrink-0">
          <Banknote className="size-4 text-amber-500" />
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Tổng chi trả thưởng
          </p>
          <p className="text-xl font-semibold tabular-nums text-foreground leading-tight mt-0.5">
            {formatNumber(totalWinAmount)}
          </p>
        </div>
      </div>
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
  const { data, isLoading } = useWinningEntries(drawId, open);

  const handleOpenChange = useCallback(
    (o: boolean) => {
      onOpenChange(o);
    },
    [onOpenChange],
  );

  const entries = data?.entries ?? [];
  const summary = data?.summary;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex flex-col p-0 gap-0 overflow-hidden rounded-2xl shadow-2xl sm:max-w-none border"
        style={{
          width: "calc(100vw - 2rem)",
          maxWidth: "1400px",
          height: "calc(100vh - 2rem)",
          maxHeight: "960px",
        }}
      >
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b bg-background shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-purple-500/15 ring-1 ring-purple-500/30 shrink-0">
              <Trophy className="size-5 text-purple-500" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold tracking-tight">
                Báo cáo entries trúng thưởng
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Danh sách chi tiết · sắp xếp theo tiền thưởng cao nhất
              </DialogDescription>
            </div>
          </div>
        </div>

        {summary && (
          <KpiBar
            drawId={drawId}
            totalWinningEntries={summary.totalWinningEntries}
            totalWinningLines={summary.totalWinningLines}
            totalWinAmount={summary.totalWinAmount}
          />
        )}

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
                  Không có entry trúng thưởng
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Kỳ này không có lines nào trúng thưởng.
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="hover:bg-muted/40">
                  <TableHead className="pl-6 w-12 text-center">#</TableHead>
                  <TableHead className="w-44">Người chơi</TableHead>
                  <TableHead className="w-28 text-right">Tiền cược</TableHead>
                  <TableHead className="min-w-[280px]">Số chơi</TableHead>
                  <TableHead className="w-52">Hạng trúng</TableHead>
                  <TableHead className="w-36 text-right">Tiền thưởng</TableHead>
                  <TableHead className="pr-6 w-36">Thời gian</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry, idx) => (
                  <WinningEntryRow key={entry.entryId} entry={entry} rowNo={idx + 1} />
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {entries.length > 0 && (
          <div className="shrink-0 border-t bg-muted/20 px-6 py-2.5 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{entries.length} entries</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function WinningEntryRow({ entry, rowNo }: { entry: WinningEntryItem; rowNo: number }) {
  const displayName = toTenantUsername(entry.username) ?? entry.username;
  const hasJp = entry.tiers.some(
    (t) => (t.tier === PrizeTier.Jackpot1 || t.tier === PrizeTier.Jackpot2) && t.hitCount > 0,
  );

  return (
    <TableRow
      className={cn(
        "align-top group transition-colors",
        hasJp
          ? "bg-purple-50/50 dark:bg-purple-950/10 hover:bg-purple-50/80 dark:hover:bg-purple-950/20 border-l-[3px] border-l-purple-400"
          : "hover:bg-muted/30",
      )}
    >
      <TableCell className="pl-6 py-3 text-center">
        <span className="text-xs text-muted-foreground/50 tabular-nums">{rowNo}</span>
      </TableCell>
      <TableCell className="py-3">
        <div className="flex items-center gap-2">
          {hasJp ? (
            <Gem className="size-3.5 text-purple-500 shrink-0 animate-pulse" />
          ) : (
            <div className="size-3.5 shrink-0" />
          )}
          <div>
            <p className="text-sm text-foreground">{displayName}</p>
            <p className="text-[10px] text-muted-foreground/50 font-mono mt-0.5 truncate max-w-32">
              @{entry.tenantId}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell className="py-3 text-right">
        <span className="text-sm tabular-nums text-foreground">{formatNumber(entry.amount)}</span>
        <p className="text-[10px] text-muted-foreground/50 mt-0.5">{entry.lineCount} lines</p>
      </TableCell>
      <TableCell className="py-3">
        <EntryNumbers entry={entry} />
      </TableCell>
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
      <TableCell className="py-3 text-right">
        <p className="text-sm tabular-nums text-foreground font-medium">
          {formatNumber(entry.winAmount)}
        </p>
      </TableCell>
      <TableCell className="py-3 pr-6">
        <span className="text-xs text-muted-foreground tabular-nums">
          {displayVNDateTime(entry.createdAt)}
        </span>
      </TableCell>
    </TableRow>
  );
}
