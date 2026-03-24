"use client";

import { useState } from "react";
import { Ticket } from "lucide-react";
import { GAME_LABELS } from "@megawin/game-core/labels";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { formatNumber } from "@megawin/shared/utils";
import { ENTRY_STATUS_LABELS, ENTRY_OUTCOME_LABELS } from "@megawin/game-core/labels";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { GameEntryDetailDialog } from "@/components/games/game-entry-detail-dialog";

import {
  usePlayerEntries,
  usePlayerEntryDetail,
  type PlayerSettledEntryResponse,
} from "../../_shared/queries";

interface PlayerFinancialEntriesViewProps {
  accountId: string;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;
  /** Game product string. */
  game: string;
}

/**
 * View drill cấp 2 — entries settled/voided của player trong 1 ngày × 1 game.
 *
 * Phân biệt hiển thị:
 * - settled + win: hiển thị payout đầy đủ, badge giải trúng
 * - settled + loss: payout = 0
 * - void: badge "Đã hủy", không hiển thị payout
 *
 * Click vào row → fetch full entry doc → hiển thị EntryDetailDialog game-specific.
 */
export function PlayerFinancialEntriesView({
  accountId,
  financialDate,
  game,
}: PlayerFinancialEntriesViewProps) {
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const { data: entries, isLoading, isError } = usePlayerEntries(accountId, financialDate, game);

  const { data: entryDetail, isLoading: isLoadingDetail } = usePlayerEntryDetail(
    accountId,
    selectedEntryId ?? "",
    game,
  );

  const gameLabel = GAME_LABELS[game as GameProduct] ?? game;

  if (isLoading) {
    return (
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pb-2 pt-4">
          <div className="flex items-center gap-2">
            <Ticket className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Đang tải...</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="space-y-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4 border-b px-5 py-3">
                {Array.from({ length: 7 }).map((_, j) => (
                  <Skeleton key={j} className="h-3 flex-1" />
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="gap-0 py-0">
        <CardContent className="flex h-[160px] items-center justify-center">
          <p className="text-sm text-destructive">Không thể tải danh sách entries.</p>
        </CardContent>
      </Card>
    );
  }

  if (!entries?.length) {
    return (
      <Card className="gap-0 py-0">
        <CardContent className="flex h-[160px] items-center justify-center">
          <p className="text-sm text-muted-foreground">Không có entry nào cho ngày này.</p>
        </CardContent>
      </Card>
    );
  }

  const getOutcomeBadge = (entry: PlayerSettledEntryResponse) => {
    if (entry.status === "void") {
      return <Badge variant="destructive">Đã hủy</Badge>;
    }
    if (!entry.outcome) return null;
    const label =
      ENTRY_OUTCOME_LABELS[entry.outcome as keyof typeof ENTRY_OUTCOME_LABELS] ?? entry.outcome;
    return (
      <Badge
        className={
          entry.winAmount > 0
            ? "border-transparent bg-profit text-profit-foreground hover:bg-profit/80"
            : ""
        }
        variant={entry.winAmount > 0 ? "default" : "secondary"}
      >
        {label}
      </Badge>
    );
  };

  const getStatusBadge = (entry: PlayerSettledEntryResponse) => {
    const label =
      ENTRY_STATUS_LABELS[entry.status as keyof typeof ENTRY_STATUS_LABELS] ?? entry.status;
    return (
      <Badge
        variant={
          entry.status === "settled"
            ? "default"
            : entry.status === "void"
              ? "destructive"
              : "secondary"
        }
      >
        {label}
      </Badge>
    );
  };

  return (
    <>
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pb-2 pt-4">
          <div className="flex items-center gap-2">
            <Ticket className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">
              Entries — {gameLabel} · {financialDate}
            </CardTitle>
          </div>
          <CardDescription className="text-xs">
            {entries.length} đơn · Click vào mã vé để xem chi tiết
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>Mã vé</TableHead>
                  <TableHead>Kỳ</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Tiền cược</TableHead>
                  <TableHead className="text-right">Tiền thắng</TableHead>
                  <TableHead className="text-right">Trả thưởng</TableHead>
                  <TableHead>Kết quả</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow
                    key={entry.entryId}
                    className="cursor-pointer text-xs hover:bg-muted/50"
                    onClick={() => setSelectedEntryId(entry.entryId)}
                  >
                    <TableCell className="font-medium">
                      <button className="font-mono text-primary underline-offset-2 hover:underline">
                        {entry.ticketNo || entry.entryId.slice(-8)}
                      </button>
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {entry.drawId}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.lineCount > 0 ? formatNumber(entry.lineCount) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(entry.amount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.status === "void" ? (
                        <span className="text-muted-foreground">—</span>
                      ) : entry.winAmount > 0 ? (
                        <span className="font-medium text-profit">
                          {formatNumber(entry.winAmount)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.status === "void" ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        formatNumber(entry.payoutAmount)
                      )}
                    </TableCell>
                    <TableCell>{getOutcomeBadge(entry)}</TableCell>
                    <TableCell>{getStatusBadge(entry)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* EntryDetailDialog — hiển thị khi click vào 1 entry */}
      <GameEntryDetailDialog
        game={game}
        entry={isLoadingDetail ? null : (entryDetail ?? null)}
        open={!!selectedEntryId && !isLoadingDetail}
        onClose={() => setSelectedEntryId(null)}
      />
    </>
  );
}
