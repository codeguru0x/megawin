"use client";

/**
 * Keno — Winning Entries Dialog
 *
 * Báo cáo entries trúng thưởng Keno.
 * Keno khác Mega 6/45:
 * - Boards: matchCount/pickCount thay vì PrizeTier
 * - Side bets: playType + bet + outcome
 * - Có thể có cappedEntries (bậc 8/9/10 bị payout cap)
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
import { KenoNumberBall } from "@/components/games/keno/keno-number-ball";
import { formatNumber } from "@megawin/shared/utils/number";
import { displayVNDateTime } from "@megawin/shared/utils/date";
import { parseUsername } from "@megawin/identity-application/shared";
import { Badge } from "@/components/ui/badge";
import { Trophy, Loader2, FileSearch, Users, Banknote, AlertCircle } from "lucide-react";
import { useWinningEntries } from "../../use-operations";
import { KENO_BIG_SMALL_BET_LABELS, KENO_EVEN_ODD_BET_LABELS } from "@megawin/game-keno/labels";
import type {
  WinningEntryItem,
  WinningEntryBoardDetail,
  WinningEntrySideBetDetail,
} from "../../use-operations";

// ─── Board chip ───────────────────────────────────────────────────────────────

const KENO_BET_LABELS: Record<string, string> = {
  ...KENO_BIG_SMALL_BET_LABELS,
  ...KENO_EVEN_ODD_BET_LABELS,
};

function BoardChip({ board }: { board: WinningEntryBoardDetail }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="text-[10px] font-medium text-muted-foreground/50 w-4 shrink-0 mt-0.5 tabular-nums">
        {board.boardNo}
      </span>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-0.5 flex-wrap max-w-[200px]">
          {board.numbers.slice(0, board.pickCount).map((n, i) => (
            <KenoNumberBall key={i} number={Number(n)} size="sm" />
          ))}
        </div>
        <span className="text-[10px] text-orange-600 dark:text-orange-400 font-medium">
          Pick {board.pickCount} — Trúng {board.matchCount}
          {board.isCapped && <span className="ml-1 text-amber-600">(cap)</span>}
        </span>
      </div>
    </div>
  );
}

function SideBetChip({ bet }: { bet: WinningEntrySideBetDetail }) {
  const typeLabel = bet.playType === "bigSmall" ? "L/N" : "C/L";
  return (
    <Badge
      variant="outline"
      className="h-5 px-1.5 text-[10px] bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/20 dark:text-cyan-400"
    >
      {typeLabel} {KENO_BET_LABELS[bet.bet] ?? bet.bet}
    </Badge>
  );
}

// ─── KPI bar ──────────────────────────────────────────────────────────────────

function KpiBar({
  drawId,
  totalWinningEntries,
  totalWinAmount,
  cappedEntries,
}: {
  drawId: string;
  totalWinningEntries: number;
  totalWinAmount: number;
  cappedEntries: number;
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
      {cappedEntries > 0 && (
        <div className="flex flex-1 items-center gap-3 px-6 py-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20 shrink-0">
            <AlertCircle className="size-4 text-amber-500" />
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Bị Payout Cap
            </p>
            <p className="text-xl font-semibold tabular-nums text-amber-600 dark:text-amber-400 leading-tight mt-0.5">
              {formatNumber(cappedEntries)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function WinningEntryRow({ entry, rowNo }: { entry: WinningEntryItem; rowNo: number }) {
  const parsed = parseUsername(entry.username);
  const displayName = parsed?.playerExternalId ?? entry.username;
  const hasCapped = entry.boardDetails.some((b) => b.isCapped);

  return (
    <TableRow
      className={cn(
        "align-top group transition-colors",
        hasCapped
          ? "bg-amber-50/50 dark:bg-amber-950/10 hover:bg-amber-50/80 dark:hover:bg-amber-950/20"
          : "hover:bg-muted/30",
      )}
    >
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
        {/* Basic boards */}
        {entry.boardDetails.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {entry.boardDetails.map((b, i) => (
              <BoardChip key={i} board={b} />
            ))}
          </div>
        )}
        {/* Side bets */}
        {entry.sideBetDetails.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {entry.sideBetDetails.map((s, i) => (
              <SideBetChip key={i} bet={s} />
            ))}
          </div>
        )}
      </TableCell>
      <TableCell className="py-3">
        <div className="flex flex-col gap-1">
          {entry.boardDetails.map((b, i) => (
            <span key={i} className="text-xs tabular-nums text-orange-700 dark:text-orange-400">
              +{formatNumber(b.winAmount)}
              {b.isCapped && <span className="ml-1 text-amber-500">[cap]</span>}
            </span>
          ))}
          {entry.sideBetDetails.map((s, i) => (
            <span key={i} className="text-xs tabular-nums text-cyan-700 dark:text-cyan-400">
              +{formatNumber(s.winAmount)}
            </span>
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
            cappedEntries={summary.cappedEntries}
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
                  <TableHead className="min-w-[240px]">Boards / Side bets</TableHead>
                  <TableHead className="w-40">Chi tiết thưởng</TableHead>
                  <TableHead className="w-32 text-right">Tổng thưởng</TableHead>
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
