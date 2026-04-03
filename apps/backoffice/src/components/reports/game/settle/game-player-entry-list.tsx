"use client";

import { useState } from "react";
import { Ticket } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatNumber } from "@megawin/shared/utils";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { getNetProfitColor } from "@/components/reports/payout-ratio";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Dữ liệu tối thiểu của 1 entry để hiển thị trong bảng. */
export interface EntryRow {
  id: string;
  /** Mã vé hiển thị cho người chơi. */
  ticketNo: string;
  /** Số boards trong vé. */
  boardCount: number;
  /**
   * Số lines sau khi expand (chỉ có ở các game có lines: lotto535, mega645, power655, max3d, max3dpro).
   * Undefined = game không có lines (keno, bingo18) → cột sẽ chỉ hiện "Boards".
   */
  lineCount?: number;
  /** Số đơn vị cược (betUnitCount). */
  betUnitCount: number;
  /** Tổng tiền cược (VND). */
  amount: number;
  /** Tổng tiền trả thưởng (VND). Undefined = chưa settle. */
  payoutAmount?: number;
  /** Trạng thái entry. Dùng để xác định entry đã settle chưa. */
  isSettled: boolean;
}

export interface GamePlayerEntryListProps {
  drawId: string;
  tenantId: string;
  accountId: string;
  playerDisplayName?: string;
  rows: EntryRow[];
  /**
   * Render prop nhận entry id và trả về dialog chi tiết game-specific.
   * Component cha chịu trách nhiệm mở/đóng dialog của từng game.
   *
   * @example
   * ```tsx
   * renderDetailDialog={(selectedId, onClose) => (
   *   <Mega645EntryDetailDialog
   *     entry={entries.find(e => e.id === selectedId) ?? null}
   *     open={!!selectedId}
   *     onClose={onClose}
   *   />
   * )}
   * ```
   */
  renderDetailDialog: (selectedEntryId: string | null, onClose: () => void) => React.ReactNode;
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Bảng entries — level 4 drill-down trong tab "Theo kỳ quay".
 *
 * Dùng chung cho tất cả game. Cột "Boards/Lines" tự điều chỉnh:
 * - Game có lines (lotto535, mega645, power655, max3d, max3dpro): hiển thị "B / L" (boards/lines).
 * - Game không có lines (keno, bingo18): chỉ hiển thị "Boards".
 *
 * Dialog chi tiết game-specific được inject qua `renderDetailDialog`.
 */
export function GamePlayerEntryList({
  drawId,
  tenantId,
  accountId,
  playerDisplayName,
  rows,
  renderDetailDialog,
}: GamePlayerEntryListProps) {
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  // Kiểm tra game có lines không (dựa trên dữ liệu thực tế)
  const hasLines = rows.some((r) => r.lineCount !== undefined);

  const playerLabel = playerDisplayName || accountId;

  return (
    <>
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pb-2 pt-4">
          <div className="flex items-center gap-2">
            <Ticket className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Phiếu cược — {playerLabel}</CardTitle>
          </div>
          <CardDescription className="text-xs">
            {rows.length} phiếu · Kỳ {drawId} · {tenantId}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Mã vé
                  </TableHead>
                  <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {hasLines ? REPORT_COLUMN_LABELS.boardsLines : REPORT_COLUMN_LABELS.board}
                  </TableHead>
                  <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {REPORT_COLUMN_LABELS.betUnitCount}
                  </TableHead>
                  <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {REPORT_COLUMN_LABELS.totalStake}
                  </TableHead>
                  <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {REPORT_COLUMN_LABELS.totalPayout}
                  </TableHead>
                  <TableHead className="pr-5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {REPORT_COLUMN_LABELS.playerNetProfit}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((entry) => {
                  const playerNet = entry.isSettled
                    ? (entry.payoutAmount ?? 0) - entry.amount
                    : null;

                  return (
                    <TableRow
                      key={entry.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedEntryId(entry.id)}
                    >
                      <TableCell className="pl-5 font-mono text-sm">{entry.ticketNo}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {hasLines ? (
                          <>
                            {formatNumber(entry.boardCount)}/{formatNumber(entry.lineCount ?? 0)}
                          </>
                        ) : (
                          formatNumber(entry.boardCount)
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNumber(entry.betUnitCount)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNumber(entry.amount)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {entry.isSettled ? (
                          formatNumber(entry.payoutAmount ?? 0)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell
                        className={`pr-5 text-right text-sm tabular-nums font-medium ${
                          playerNet !== null ? getNetProfitColor(playerNet) : ""
                        }`}
                      >
                        {playerNet !== null ? (
                          <>
                            {playerNet > 0 ? "+" : ""}
                            {formatNumber(playerNet)}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {renderDetailDialog(selectedEntryId, () => setSelectedEntryId(null))}
    </>
  );
}
