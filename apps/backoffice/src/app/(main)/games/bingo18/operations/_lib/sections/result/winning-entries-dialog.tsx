"use client";

/**
 * Bingo 18 — Winning Entries Dialog
 *
 * Báo cáo phiếu trúng thưởng Bingo 18 cho staff monitor.
 * Cột "Chi tiết trúng thưởng" gộp mỗi board vào 1 dòng, tách rõ 3 phần:
 * - Loại cược (nhãn playType).
 * - Khách chọn gì: số (highlight nếu khớp kết quả) / "3 số bất kỳ" / tổng / lớn-nhỏ.
 * - Trúng gì: số lần khớp (×matchCount) hoặc KQ kỳ quay + tiền thưởng.
 * KPI bar chỉ gồm Phiếu trúng + Tổng chi trả thưởng (bỏ card kết quả kỳ quay).
 */

import { useCallback, useMemo, useState } from "react";

import { BINGO18_SIDE_BET_PLAY_TYPE_SET } from "@megawin/game-bingo18/entities";
import {
  BINGO18_BIG_SMALL_BET_LABELS,
  BINGO18_PLAY_TYPE_LABELS,
  BINGO18_TRIPLE_KIND_LABELS,
} from "@megawin/game-bingo18/labels";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { formatNumber, formatVN, toTenantUsername } from "@megawin/shared/utils";
import { Banknote, FileSearch, Loader2, Trophy, Users } from "lucide-react";

import { Bingo18MatchDie } from "@/components/games/bingo18/dice-display";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { Bingo18EntryDetailDialog } from "../../../../reports/settle/_lib/sections/entry-detail-dialog";
import type { WinningBoardDetail, WinningEntryItem } from "../../use-operations";
import { useWinningEntries, useWinningEntryDetail, WINNING_ENTRIES_PAGE_SIZE } from "../../use-operations";

// ─── Labels ────────────────────────────────────────────────────────────────────

const BOARD_LABELS: Record<string, string> = {
  ...BINGO18_PLAY_TYPE_LABELS,
  "tripleMatch-specific": BINGO18_TRIPLE_KIND_LABELS["specific"],
  "tripleMatch-any": BINGO18_TRIPLE_KIND_LABELS["any"],
};

// ─── Board detail row (1 dòng/board trong cột gộp) ──────────────────────────────

/**
 * Board cơ bản (singleNum/doubleMatch/tripleMatch): 3 phần rõ ràng cho staff monitor —
 * nhãn loại cược · số khách chọn (highlight nếu khớp kết quả) · trúng gì (×matchCount + tiền).
 * tripleMatch-any không có số cụ thể → hiển thị nhãn "3 số bất kỳ".
 */
function BasicBoardDetail({ board, winningSet }: { board: WinningBoardDetail; winningSet: Set<number> }) {
  const key = board.playType === "tripleMatch" && board.tripleKind ? `tripleMatch-${board.tripleKind}` : board.playType;
  const label = BOARD_LABELS[key] ?? board.playType;
  const isAnyTriple = board.playType === "tripleMatch" && board.tripleKind === "any";

  return (
    <div
      className="grid items-center gap-x-2 rounded-md border-l-[3px] border-l-amber-400 py-1.5 pl-2"
      style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs font-semibold text-foreground whitespace-nowrap">{label}</span>
        {/* Khách chọn gì */}
        {isAnyTriple ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap">
            3 số bất kỳ
          </span>
        ) : board.number !== undefined ? (
          <Bingo18MatchDie n={board.number} variant={winningSet.has(board.number) ? "matched" : "default"} size="sm" />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
        {/* Trúng gì: số lần khớp */}
        {board.matchCount != null && board.matchCount > 0 && (
          <span className="inline-flex items-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-amber-700 dark:text-amber-400 whitespace-nowrap">
            trúng ×{board.matchCount}
          </span>
        )}
      </div>
      <span className="text-xs tabular-nums font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap justify-self-end">
        +{formatNumber(board.winAmount)}
      </span>
    </div>
  );
}

/**
 * Side bet (sumTotal/bigSmallDraw): nhãn loại cược · nội dung khách chọn (tổng / lớn-nhỏ) ·
 * outcome kết quả thực tế · tiền trúng.
 */
function SideBetDetail({ board, drawSum }: { board: WinningBoardDetail; drawSum: number }) {
  const isSum = board.playType === "sumTotal";
  const typeLabel = isSum ? "Tổng điểm" : "Lớn/Hòa/Nhỏ";
  const pick = isSum
    ? `Tổng ${board.sum ?? "?"}`
    : (BINGO18_BIG_SMALL_BET_LABELS[board.bet as keyof typeof BINGO18_BIG_SMALL_BET_LABELS] ?? board.bet ?? "—");
  return (
    <div
      className="grid items-center gap-x-2 rounded-md border-l-[3px] border-l-cyan-400 py-1.5 pl-2"
      style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}
    >
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        <span className="rounded bg-cyan-50 px-1.5 py-0.5 text-xs font-semibold text-cyan-700 border border-cyan-200 dark:bg-cyan-950/20 dark:text-cyan-400 dark:border-cyan-900 whitespace-nowrap">
          {typeLabel} · {pick}
        </span>
        {/* Trúng gì: kết quả thực tế của kỳ quay để đối chiếu */}
        {drawSum > 0 && <span className="text-[11px] text-muted-foreground whitespace-nowrap">KQ: tổng {drawSum}</span>}
      </div>
      <span className="text-xs tabular-nums font-semibold text-cyan-700 dark:text-cyan-400 whitespace-nowrap justify-self-end">
        +{formatNumber(board.winAmount)}
      </span>
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

function KpiBar({ totalWinningEntries, totalWinAmount }: { totalWinningEntries: number; totalWinAmount: number }) {
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
  const winningSet = new Set(entry.winningNumbers);

  const basicBoards = entry.boardDetails.filter((b) => !BINGO18_SIDE_BET_PLAY_TYPE_SET.has(b.playType));
  const sideBetBoards = entry.boardDetails.filter((b) => BINGO18_SIDE_BET_PLAY_TYPE_SET.has(b.playType));

  return (
    <TableRow onClick={onClick} className="align-top group transition-colors hover:bg-muted/30 cursor-pointer">
      <TableCell className="pl-6 py-3 text-center">
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
          {rowNo}
        </span>
      </TableCell>
      <TableCell className="py-3">
        <div>
          <p className="text-sm text-foreground">{displayName}</p>
          <p className="text-xs text-muted-foreground/60 font-mono mt-0.5 truncate max-w-32">@{entry.tenantId}</p>
        </div>
      </TableCell>
      <TableCell className="py-3 text-right">
        <span className="text-sm tabular-nums text-foreground">{formatNumber(entry.amount)}</span>
      </TableCell>
      <TableCell className="py-3">
        <div className="flex flex-col gap-1.5">
          {basicBoards.map((b, i) => (
            <BasicBoardDetail key={`b-${i}`} board={b} winningSet={winningSet} />
          ))}
          {sideBetBoards.map((b, i) => (
            <SideBetDetail key={`s-${i}`} board={b} drawSum={entry.drawSum} />
          ))}
        </div>
      </TableCell>
      <TableCell className="py-3 pr-6 text-right">
        <p className="text-sm tabular-nums text-foreground font-semibold">{formatNumber(entry.winAmount)}</p>
        <p className="text-xs text-muted-foreground/50 tabular-nums mt-0.5">
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
              <DialogTitle className="text-base font-bold tracking-tight">Danh sách trúng thưởng</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Kỳ <span className="font-mono text-foreground">{drawId}</span>
              </DialogDescription>
            </div>
          </div>
        </div>

        {summary && (
          <KpiBar totalWinningEntries={summary.totalWinningEntries} totalWinAmount={summary.totalWinAmount} />
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
                <p className="text-base font-semibold text-foreground">Không có phiếu trúng thưởng</p>
                <p className="mt-1 text-sm text-muted-foreground">Kỳ này không có phiếu cược nào trúng thưởng.</p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="hover:bg-muted/40">
                  <TableHead className="pl-6 w-12 text-center">STT</TableHead>
                  <TableHead className="w-44">{REPORT_COLUMN_LABELS.player}</TableHead>
                  <TableHead className="w-28 text-right">{REPORT_COLUMN_LABELS.totalStake}</TableHead>
                  <TableHead className="min-w-96">{REPORT_COLUMN_LABELS.winningDetail}</TableHead>
                  <TableHead className="pr-6 w-40 text-right">{REPORT_COLUMN_LABELS.winAmount}</TableHead>
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

      <Bingo18EntryDetailDialog
        entry={selectedEntry ?? null}
        open={!!selectedEntryId}
        onClose={() => setSelectedEntryId(null)}
      />
    </Dialog>
  );
}
