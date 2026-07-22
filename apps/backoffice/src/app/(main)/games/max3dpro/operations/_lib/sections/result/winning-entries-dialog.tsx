"use client";

/**
 * Max 3D Pro — Winning Entries Dialog
 *
 * Báo cáo entries trúng thưởng Max 3D Pro.
 * Max 3D Pro đặc thù:
 * - boards[].triplets: danh sách bộ ba (multiNumber: 3-20 bộ, multiDigit: expand từ frontDigits × backDigits).
 * - playMode: multiNumber / multiDigit.
 * - playType: straight.
 * - 8 PrizeTier (special, specialSub, first-sixth).
 * - isDuplicate: 2 bộ ba giống nhau → giải thưởng × 2.
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
import { Badge } from "@/components/ui/badge";
import { TripletDisplay } from "@/components/games/max3dpro/triplet-display";
import { formatNumber, displayVNDateTime } from "@megawin/shared/utils";
import { toTenantUsername } from "@megawin/shared/utils";
import { Trophy, Loader2, FileSearch, Users, Banknote } from "lucide-react";
import {
  MAX3DPRO_PLAY_MODE_LABELS,
  MAX3DPRO_PLAY_TYPE_LABELS,
  MAX3DPRO_PRIZE_TIER_LABELS,
} from "@megawin/game-max3dpro/labels";
import { PrizeTier } from "@megawin/game-max3dpro/entities";
import { cn } from "@/lib/utils";
import { useWinningEntries } from "../../use-operations";
import type { WinningEntryItem } from "../../use-operations";

// ─── Board chip ───────────────────────────────────────────────────────────────

function BoardChip({ board }: { board: WinningEntryItem["boards"][number] }) {
  const modeLabel =
    MAX3DPRO_PLAY_MODE_LABELS[board.playMode as keyof typeof MAX3DPRO_PLAY_MODE_LABELS] ??
    board.playMode;

  return (
    <div className="flex items-start gap-2">
      <span className="text-[10px] font-medium text-muted-foreground/50 w-4 shrink-0 mt-0.5 tabular-nums">
        {board.boardNo}
      </span>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1 flex-wrap max-w-65">
          {board.triplets.map((t, i) => (
            <TripletDisplay key={i} value={t} variant="special" size="sm" />
          ))}
        </div>
        <span className="text-[10px] text-orange-600 dark:text-orange-400 font-medium">
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
  const badgeClass =
    TIER_BADGE_COLORS[tier.tier as PrizeTier] ?? "border-border bg-muted/40 text-muted-foreground";

  return (
    <div className="flex items-center gap-1.5">
      <Badge variant="outline" className={cn("text-[10px] py-0 h-4", badgeClass)}>
        {label}
      </Badge>
      <span className="text-xs tabular-nums text-amber-700 dark:text-amber-400">
        +{formatNumber(tier.amount)}
      </span>
    </div>
  );
}

// ─── KPI bar ──────────────────────────────────────────────────────────────────

function KpiBar({
  drawId,
  totalWinningEntries,
  totalWinAmount,
}: {
  drawId: string;
  totalWinningEntries: number;
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
        <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/15 border border-amber-500/30 shrink-0">
          <Banknote className="size-4 text-amber-500" />
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Tổng chi trả
          </p>
          <p className="text-xl font-semibold tabular-nums text-foreground leading-tight mt-0.5">
            {formatNumber(totalWinAmount)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function WinningEntryRow({ entry, rowNo }: { entry: WinningEntryItem; rowNo: number }) {
  const displayName = toTenantUsername(entry.username) ?? entry.username;

  return (
    <TableRow className="align-top group transition-colors hover:bg-muted/30">
      <TableCell className="pl-6 py-3 text-center">
        <span className="text-xs text-muted-foreground/50 tabular-nums">{rowNo}</span>
      </TableCell>
      <TableCell className="py-3">
        <div>
          <p className="text-sm text-foreground">{displayName}</p>
          <p className="text-[10px] text-muted-foreground/50 font-mono mt-0.5 truncate max-w-32">
            @{entry.tenantId}
          </p>
        </div>
      </TableCell>
      <TableCell className="py-3 text-right">
        <span className="text-sm tabular-nums text-foreground">{formatNumber(entry.amount)}</span>
      </TableCell>
      <TableCell className="py-3">
        <div className="flex flex-col gap-1.5">
          {entry.boards.map((b, i) => (
            <BoardChip key={i} board={b} />
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

// ─── Main dialog ──────────────────────────────────────────────────────────────

interface WinningEntriesDialogProps {
  drawId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WinningEntriesDialog({ drawId, open, onOpenChange }: WinningEntriesDialogProps) {
  const { data, isLoading } = useWinningEntries(drawId, open);
  const handleOpenChange = useCallback((o: boolean) => onOpenChange(o), [onOpenChange]);

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
            <div className="flex size-10 items-center justify-center rounded-xl bg-orange-500/15 ring-1 ring-orange-500/30 shrink-0">
              <Trophy className="size-5 text-orange-500" />
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
                  Kỳ này không có entries nào trúng thưởng.
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="hover:bg-muted/40">
                  <TableHead className="pl-6 w-12 text-center">#</TableHead>
                  <TableHead className="w-44">Người chơi</TableHead>
                  <TableHead className="w-24 text-right">Tiền cược</TableHead>
                  <TableHead className="min-w-65">Bộ ba số</TableHead>
                  <TableHead className="w-48">Hạng giải trúng</TableHead>
                  <TableHead className="w-32 text-right">Tổng thưởng</TableHead>
                  <TableHead className="pr-6 w-36">Thời gian</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry: WinningEntryItem, idx: number) => (
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
