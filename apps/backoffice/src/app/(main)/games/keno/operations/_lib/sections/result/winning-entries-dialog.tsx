"use client";

/**
 * Keno — Winning Entries Dialog
 *
 * Báo cáo phiếu trúng thưởng Keno cho staff monitor.
 * Cột "Chi tiết trúng thưởng" gộp board + số + tiền vào 1 dòng/board để dễ đối chiếu:
 * - Cơ bản (pick): highlight số trúng (matched) vs không trúng (default) so với winningNumbers.
 * - Side bet (bigSmall/evenOdd): nhãn cược + outcome diễn giải mức giải.
 * - Board bị payout cap (bậc 8/9/10) được đánh dấu [cap].
 */
import { useCallback, useMemo, useState } from "react";

import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { KENO_SIDE_BET_PLAY_TYPE_SET } from "@megawin/game-keno/entities";
import { KENO_BIG_SMALL_BET_LABELS, KENO_EVEN_ODD_BET_LABELS } from "@megawin/game-keno/labels";
import { formatNumber, formatVN, toTenantUsername } from "@megawin/shared/utils";
import { AlertCircle, Banknote, FileSearch, Loader2, Trophy, Users } from "lucide-react";

import { KenoMatchBall } from "@/components/games/keno/keno-number-ball";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { boardColorVar } from "@/lib/game-colors";
import { cn } from "@/lib/utils";

import { KenoEntryDetailDialog } from "../../../../reports/settle/_lib/sections/entry-detail-dialog";
import {
  useWinningEntries,
  useWinningEntryDetail,
  WINNING_ENTRIES_PAGE_SIZE,
  type WinningEntryBoardDetail,
  type WinningEntryItem,
} from "../../use-operations";

// ─── Labels ────────────────────────────────────────────────────────────────────

const KENO_BET_LABELS: Record<string, string> = {
  ...KENO_BIG_SMALL_BET_LABELS,
  ...KENO_EVEN_ODD_BET_LABELS,
};

/**
 * Diễn giải outcome side bet thắng → mô tả ngắn mức trúng cho staff.
 * outcome win khả dĩ: big13Plus, big1112, small13Plus, small1112, draw,
 * even15Plus, even1314, even1112, odd15Plus, odd1314, odd1112.
 */
const KENO_OUTCOME_LABELS: Record<string, string> = {
  big13Plus: "≥13 số Lớn",
  big1112: "11-12 số Lớn",
  small13Plus: "≥13 số Nhỏ",
  small1112: "11-12 số Nhỏ",
  even15Plus: "≥15 số Chẵn",
  even1314: "13-14 số Chẵn",
  even1112: "11-12 số Chẵn",
  odd15Plus: "≥15 số Lẻ",
  odd1314: "13-14 số Lẻ",
  odd1112: "11-12 số Lẻ",
  draw: "Hoà 10-10",
};

// ─── Board detail row (1 dòng/board trong cột gộp) ──────────────────────────────

function BasicBoardDetail({ board, winningSet }: { board: WinningEntryBoardDetail; winningSet: Set<string> }) {
  const boardColor = boardColorVar(board.boardNo);
  const numbers = board.numbers ?? [];
  return (
    <div
      className="grid items-center gap-x-2 rounded-md border-l-3 py-1.5 pl-2"
      style={{
        borderLeftColor: boardColor,
        gridTemplateColumns: "1.25rem minmax(0,1fr) auto",
      }}
    >
      <span className="text-xs leading-none font-extrabold" style={{ color: boardColor }}>
        {board.boardNo}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-foreground text-xs font-semibold whitespace-nowrap">
            Pick {board.pickCount ?? 0}/{board.matchCount ?? 0}
            {board.isCapped && <span className="text-warning ml-1">[cap]</span>}
          </span>
          <div className="flex flex-wrap items-center gap-0.5">
            {numbers.map((n) => (
              <KenoMatchBall key={n} n={n} variant={winningSet.has(n) ? "matched" : "default"} />
            ))}
          </div>
        </div>
      </div>
      <span className="text-primary justify-self-end text-xs font-semibold whitespace-nowrap tabular-nums">
        +{formatNumber(board.winAmount)}
      </span>
    </div>
  );
}

function SideBetDetail({ board }: { board: WinningEntryBoardDetail }) {
  const boardColor = boardColorVar(board.boardNo);
  const typeLabel = board.playType === "bigSmall" ? "Lớn/Nhỏ" : "Chẵn/Lẻ";
  const betLabel = KENO_BET_LABELS[board.bet ?? ""] ?? board.bet ?? "—";
  const outcomeLabel = board.outcome ? KENO_OUTCOME_LABELS[board.outcome] : undefined;
  return (
    <div
      className="grid items-center gap-x-2 rounded-md border-l-3 py-1.5 pl-2"
      style={{
        borderLeftColor: boardColor,
        gridTemplateColumns: "1.25rem minmax(0,1fr) auto",
      }}
    >
      <span className="text-xs leading-none font-extrabold" style={{ color: boardColor }}>
        {board.boardNo}
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="border-info bg-info text-info rounded border px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap">
          {typeLabel} · {betLabel}
        </span>
        {outcomeLabel && <span className="text-muted-foreground text-xs whitespace-nowrap">{outcomeLabel}</span>}
      </div>
      <span className="text-info justify-self-end text-xs font-semibold whitespace-nowrap tabular-nums">
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
  valueColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-card flex min-w-0 flex-1 items-center gap-3 rounded-xl border p-4 shadow-sm">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground truncate text-xs font-medium">{label}</p>
        <p className={cn("text-lg leading-tight font-bold tabular-nums", valueColor ?? "text-foreground")}>{value}</p>
      </div>
    </div>
  );
}

function KpiBar({
  totalWinningEntries,
  totalWinAmount,
  cappedEntries,
}: {
  totalWinningEntries: number;
  totalWinAmount: number;
  cappedEntries: number;
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
        icon={Banknote}
        iconBg="bg-warning"
        iconColor="text-warning"
        label={REPORT_COLUMN_LABELS.totalWinningPayout}
        value={formatNumber(totalWinAmount)}
      />
      {cappedEntries > 0 && (
        <KpiCard
          icon={AlertCircle}
          iconBg="bg-warning"
          iconColor="text-warning"
          label="Bị Payout Cap"
          value={formatNumber(cappedEntries)}
          valueColor="text-warning"
        />
      )}
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function WinningEntryRow({ entry, rowNo, onClick }: { entry: WinningEntryItem; rowNo: number; onClick: () => void }) {
  const displayName = toTenantUsername(entry.username) ?? entry.username;
  const hasCapped = entry.boardDetails.some((b) => b.isCapped);
  const winningSet = new Set(entry.winningNumbers);

  // Phân tách boardDetails thành basic boards và side bet boards
  const basicBoards = entry.boardDetails.filter((b) => !KENO_SIDE_BET_PLAY_TYPE_SET.has(b.playType as any));
  const sideBetBoards = entry.boardDetails.filter((b) => KENO_SIDE_BET_PLAY_TYPE_SET.has(b.playType as any));

  return (
    <TableRow
      onClick={onClick}
      className={cn(
        "group hover:bg-muted/30 cursor-pointer align-top transition-colors",
        // Entry bị payout cap: chỉ dùng border trái mảnh làm chỉ báo — nền phẳng để
        // bảng đồng nhất, tránh nền loang gây khó quét mắt. Nhãn [cap] đã có trong board detail.
        hasCapped && "border-l-3 border-l-warning",
      )}
    >
      <TableCell className="py-3 pl-6 text-center">
        <span
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
            hasCapped ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground",
          )}
        >
          {rowNo}
        </span>
      </TableCell>
      <TableCell className="py-3">
        <div>
          <p className="text-foreground text-sm">{displayName}</p>
          <p className="text-muted-foreground/60 mt-0.5 max-w-32 truncate font-mono text-xs">@{entry.tenantId}</p>
        </div>
      </TableCell>
      <TableCell className="py-3 text-right">
        <span className="text-foreground text-sm tabular-nums">{formatNumber(entry.amount)}</span>
      </TableCell>
      <TableCell className="py-3">
        <div className="flex flex-col gap-1.5">
          {basicBoards.map((b, i) => (
            <BasicBoardDetail key={`b-${i}`} board={b} winningSet={winningSet} />
          ))}
          {sideBetBoards.map((b, i) => (
            <SideBetDetail key={`s-${i}`} board={b} />
          ))}
        </div>
      </TableCell>
      <TableCell className="py-3 pr-6 text-right">
        <p className="text-foreground text-sm font-semibold tabular-nums">{formatNumber(entry.winAmount)}</p>
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
            <div className="bg-warning/15 ring-warning/30 flex size-10 shrink-0 items-center justify-center rounded-xl ring-1">
              <Trophy className="text-warning size-5" />
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
            totalWinAmount={summary.totalWinAmount}
            cappedEntries={summary.cappedEntries}
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
                  <TableHead className="min-w-96">{REPORT_COLUMN_LABELS.winningDetail}</TableHead>
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

      <KenoEntryDetailDialog
        entry={selectedEntry ?? null}
        open={!!selectedEntryId}
        onClose={() => setSelectedEntryId(null)}
      />
    </Dialog>
  );
}
