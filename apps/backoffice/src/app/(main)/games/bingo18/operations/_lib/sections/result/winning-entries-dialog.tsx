"use client";

/**
 * Bingo 18 — Winning Entries Dialog
 *
 * Báo cáo entries trúng thưởng Bingo 18.
 * Bingo 18 khác Keno:
 * - boardDetails[] chứa cả cơ bản và bổ sung, UI filter theo playType
 * - Cơ bản: playType (singleNum/doubleMatch/tripleMatch) + matchCount + tripleKind
 * - Bổ sung: playType (sumTotal/bigSmallDraw) + sum/bet
 * - Không có payout caps (không có cappedEntries)
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
import { formatNumber, displayVNDateTime } from "@megawin/shared/utils";
import { toTenantUsername } from "@megawin/shared/utils";
import { Badge } from "@/components/ui/badge";
import { Trophy, Loader2, FileSearch, Users, Banknote } from "lucide-react";
import { BINGO18_PLAY_TYPE_LABELS, BINGO18_TRIPLE_KIND_LABELS } from "@megawin/game-bingo18/labels";
import { BINGO18_SIDE_BET_PLAY_TYPE_SET } from "@megawin/game-bingo18/entities";
import { useWinningEntries } from "../../use-operations";
import type { WinningEntryItem, WinningBoardDetail } from "../../use-operations";

// ─── Board chip ───────────────────────────────────────────────────────────────

const BOARD_LABELS: Record<string, string> = {
  ...BINGO18_PLAY_TYPE_LABELS,
  "tripleMatch-specific": BINGO18_TRIPLE_KIND_LABELS["specific"],
  "tripleMatch-any": BINGO18_TRIPLE_KIND_LABELS["any"],
};

function BoardChip({ board }: { board: WinningBoardDetail }) {
  const key =
    board.playType === "tripleMatch" && board.tripleKind
      ? `tripleMatch-${board.tripleKind}`
      : board.playType;
  const label = BOARD_LABELS[key] ?? board.playType;

  return (
    <div className="flex items-start gap-1.5">
      <div className="flex flex-col gap-0.5">
        {board.number !== undefined && (
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-amber-500 text-white text-xs font-bold tabular-nums">
            {board.number}
          </span>
        )}
        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
          {label} — Trúng {board.matchCount ?? 0}
        </span>
      </div>
    </div>
  );
}

function SideBetChip({ board }: { board: WinningBoardDetail }) {
  const label =
    board.playType === "sumTotal" ? `Tổng ${board.sum ?? "?"}` : `L/N — ${board.bet ?? "?"}`;
  return (
    <Badge
      variant="outline"
      className="h-5 px-1.5 text-[10px] bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/20 dark:text-cyan-400"
    >
      {label}
    </Badge>
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

  // boardDetails chứa cả cơ bản và bổ sung — split theo playType
  const basicBoards = entry.boardDetails.filter(
    (b) => !BINGO18_SIDE_BET_PLAY_TYPE_SET.has(b.playType),
  );
  const sideBetBoards = entry.boardDetails.filter((b) =>
    BINGO18_SIDE_BET_PLAY_TYPE_SET.has(b.playType),
  );

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
        {basicBoards.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {basicBoards.map((b: WinningBoardDetail, i: number) => (
              <BoardChip key={i} board={b} />
            ))}
          </div>
        )}
        {sideBetBoards.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {sideBetBoards.map((b: WinningBoardDetail, i: number) => (
              <SideBetChip key={i} board={b} />
            ))}
          </div>
        )}
      </TableCell>
      <TableCell className="py-3">
        <div className="flex flex-col gap-1">
          {basicBoards.map((b: WinningBoardDetail, i: number) => (
            <span key={i} className="text-xs tabular-nums text-amber-700 dark:text-amber-400">
              +{formatNumber(b.winAmount)}
            </span>
          ))}
          {sideBetBoards.map((b: WinningBoardDetail, i: number) => (
            <span key={i} className="text-xs tabular-nums text-cyan-700 dark:text-cyan-400">
              +{formatNumber(b.winAmount)}
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
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/30 shrink-0">
              <Trophy className="size-5 text-amber-500" />
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
                  <TableHead className="min-w-[200px]">Boards / Side bets</TableHead>
                  <TableHead className="w-36">Chi tiết thưởng</TableHead>
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
