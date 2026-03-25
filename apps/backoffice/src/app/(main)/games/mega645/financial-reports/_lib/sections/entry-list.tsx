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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatNumber } from "@megawin/shared/utils";
import type { TicketEntryEntity } from "@megawin/game-mega645/entities";
import { PlayType, PrizeTier } from "@megawin/game-mega645/entities/enums";
import { MEGA645_PLAY_TYPE_LABELS, MEGA645_PRIZE_TIER_LABELS } from "@megawin/game-mega645/labels";
import {
  ENTRY_STATUS_LABELS,
  ENTRY_OUTCOME_LABELS,
  REPORT_COLUMN_LABELS,
} from "@megawin/game-core/labels";
import type { EntryStatus, EntryOutcome } from "@megawin/game-core/entities";
import { toTenantUsername } from "@megawin/shared/utils";
import { useMega645Entries } from "../use-report-queries";
import { TableSkeleton, ErrorCard, EmptyCard } from "./shared-states";

/**
 * Lấy phần tên hiển thị ngắn gọn từ username.
 * Format username: "playerExternalId@tenantId" → trả về "playerExternalId".
 * Nếu không parse được → giữ nguyên.
 */
function shortDisplayName(username: string | undefined | null, accountId: string): string {
  const raw = username || accountId;
  return toTenantUsername(raw) ?? raw;
}

/** Chi tiết 1 entry Mega 6/45 — bộ số, kết quả quay, giải trúng. */
export function Mega645EntryDetailDialog({
  entry,
  open,
  onClose,
}: {
  entry: TicketEntryEntity | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!entry) return null;

  const tiers = entry.payout?.tiers ?? [];
  const boards = entry.entrySummary.boards ?? [];
  const status = entry.status as EntryStatus;
  const outcome = entry.outcome as EntryOutcome | undefined;
  const isWin = outcome === "win";
  // scheduled = đang chờ kết quả, chưa có payout/result → KHÔNG hiển thị lãi/lỗ
  const isScheduled = status === "scheduled";

  const winningSet = new Set(entry.result?.winningNumbers ?? []);

  const playType =
    boards.length > 0 && boards[0]
      ? (MEGA645_PLAY_TYPE_LABELS[boards[0].playType as PlayType] ?? boards[0].playType)
      : "—";

  const displayName = shortDisplayName(entry.username, entry.accountId);

  // Lãi/lỗ chỉ có ý nghĩa sau khi settle — không tính cho scheduled entry
  const playerNet = isScheduled ? null : (entry.payout?.payoutAmount ?? 0) - entry.amount;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Ticket className="size-4" />
            Chi tiết Entry — Mega 6/45
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {entry.entrySummary.ticketNo}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-6 max-h-[72vh] space-y-3 overflow-y-auto px-6">
          {/* ── Thông tin vé ── */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: REPORT_COLUMN_LABELS.drawId, value: entry.drawId, mono: true },
              { label: "Đại lý", value: entry.tenantId },
              { label: "Người chơi", value: displayName },
              { label: "Kiểu chơi", value: playType },
              { label: "Boards", value: formatNumber(boards.length) },
              { label: REPORT_COLUMN_LABELS.lineCount, value: formatNumber(entry.lineCount) },
            ].map((item) => (
              <div key={item.label} className="min-w-0 rounded-md bg-muted/40 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">{item.label}</p>
                <p
                  className={`truncate text-sm font-semibold tabular-nums ${item.mono ? "font-mono text-xs" : ""}`}
                  title={item.value}
                >
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          {/* ── Trạng thái đang chờ — hiển thị thay thế tài chính khi scheduled ── */}
          {isScheduled && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
              <Badge variant="secondary">Đang chờ quay số</Badge>
              <p className="text-xs text-muted-foreground">
                Kết quả sẽ có sau kỳ quay · {entry.drawId}
              </p>
            </div>
          )}

          {/* ── Tài chính + Trạng thái ── */}
          <div className="rounded-lg border p-3">
            <div className="mb-2.5 flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Tài chính
              </p>
              <div className="flex items-center gap-1.5">
                <Badge
                  variant={
                    status === "settled"
                      ? "default"
                      : status === "void"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {ENTRY_STATUS_LABELS[status] ?? status}
                </Badge>
                {outcome && (
                  <Badge
                    className={
                      isWin
                        ? "border-transparent bg-profit text-profit-foreground hover:bg-profit/80"
                        : ""
                    }
                    variant={outcome === "void" ? "destructive" : isWin ? "default" : "secondary"}
                  >
                    {ENTRY_OUTCOME_LABELS[outcome] ?? outcome}
                  </Badge>
                )}
              </div>
            </div>
            <div className={`grid gap-x-4 gap-y-2 ${isScheduled ? "grid-cols-2" : "grid-cols-4"}`}>
              <div>
                <p className="text-[11px] text-muted-foreground">Tiền cược</p>
                <p className="text-sm font-bold tabular-nums">{formatNumber(entry.amount)}</p>
              </div>
              {!isScheduled && (
                <div>
                  <p className="text-[11px] text-muted-foreground">
                    {REPORT_COLUMN_LABELS.totalPayout}
                  </p>
                  <p className={`text-sm font-bold tabular-nums ${isWin ? "text-profit" : ""}`}>
                    {formatNumber(entry.payout?.payoutAmount ?? 0)}
                  </p>
                </div>
              )}
              <div>
                <p className="text-[11px] text-muted-foreground">
                  {REPORT_COLUMN_LABELS.totalCommission}
                </p>
                <p className="text-sm font-bold tabular-nums">
                  {formatNumber(entry.tenant.commissionAmount)}
                </p>
              </div>
              {playerNet !== null && (
                <div>
                  <p className="text-[11px] text-muted-foreground">Lãi/lỗ (khách)</p>
                  <p
                    className={`text-sm font-bold tabular-nums ${
                      playerNet > 0
                        ? "text-profit"
                        : playerNet < 0
                          ? "text-loss"
                          : "text-muted-foreground"
                    }`}
                  >
                    {playerNet > 0 ? "+" : ""}
                    {formatNumber(playerNet)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── Bộ số đã chọn — highlight trùng kết quả quay ── */}
          {boards.length > 0 && (
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Bộ số đã chọn
              </p>
              <div className="space-y-2">
                {boards.map((board, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {board.boardNo} ·{" "}
                      {MEGA645_PLAY_TYPE_LABELS[board.playType as PlayType] ?? board.playType}
                    </Badge>
                    <div className="flex flex-wrap gap-1">
                      {board.numbers.map((num) => (
                        <span
                          key={num}
                          className={`inline-flex size-7 items-center justify-center rounded-full text-xs font-medium ${
                            winningSet.has(num)
                              ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                              : "bg-muted"
                          }`}
                        >
                          {num}
                        </span>
                      ))}
                    </div>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {board.expandedLines} lines
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Kết quả quay — chỉ hiển thị sau khi có kết quả ── */}
          {entry.result && (
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Kết quả — Kỳ {entry.drawId}
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {entry.result.winningNumbers.map((num) => (
                  <span
                    key={num}
                    className="inline-flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                  >
                    {num}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Giải trúng — chỉ hiển thị khi có giải ── */}
          {tiers.length > 0 && (
            <div className="rounded-lg border border-profit/30 bg-profit/5 p-3">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-profit">
                Giải trúng
              </p>
              <div className="space-y-1.5">
                {tiers.map((tier, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <Badge variant="secondary">
                      {MEGA645_PRIZE_TIER_LABELS[tier.tier as PrizeTier] ?? tier.tier}
                    </Badge>
                    <span className="tabular-nums font-semibold text-profit">
                      ×{tier.hitCount} · {formatNumber(tier.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Cấp 4: Danh sách entries của 1 player cho 1 draw × 1 tenant. */
export function EntryList({
  drawId,
  tenantId,
  accountId,
  playerDisplayName,
}: {
  drawId: string;
  tenantId: string;
  accountId: string;
  playerDisplayName?: string;
}) {
  const [selectedEntry, setSelectedEntry] = useState<TicketEntryEntity | null>(null);
  const { data, isLoading, error } = useMega645Entries(drawId, tenantId, accountId);

  // Tên hiển thị: dùng playerDisplayName từ breadcrumb (đã strip @tenant), fallback về accountId
  const displayName = playerDisplayName
    ? shortDisplayName(playerDisplayName, accountId)
    : shortDisplayName(null, accountId);

  if (isLoading) return <TableSkeleton rows={5} />;
  if (error) return <ErrorCard />;
  if (!data?.length) return <EmptyCard msg="Không có entry nào." />;

  return (
    <>
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pb-2 pt-4">
          <div className="flex items-center gap-2">
            <Ticket className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">
              Entries — {playerDisplayName || accountId}
            </CardTitle>
          </div>
          <CardDescription className="text-xs">
            {data.length} entries · {REPORT_COLUMN_LABELS.drawId} {drawId} · {tenantId} · Click mã
            vé để xem chi tiết
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã vé</TableHead>
                  <TableHead>Kiểu chơi</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.lineCount}</TableHead>
                  <TableHead className="text-right">Cược</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                  <TableHead className="text-right">
                    {REPORT_COLUMN_LABELS.totalCommission}
                  </TableHead>
                  <TableHead>Giải</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((entry) => {
                  const entryTiers = entry.payout?.tiers ?? [];
                  const entryBoards = entry.entrySummary.boards ?? [];
                  const playType =
                    entryBoards.length > 0 && entryBoards[0]
                      ? (MEGA645_PLAY_TYPE_LABELS[entryBoards[0].playType as PlayType] ??
                        entryBoards[0].playType)
                      : "—";
                  const status = entry.status as EntryStatus;

                  return (
                    <TableRow
                      key={entry.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedEntry(entry)}
                    >
                      <TableCell className="font-medium">{entry.entrySummary.ticketNo}</TableCell>
                      <TableCell>{playType}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(entry.lineCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(entry.amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {status === "settled" ? (
                          (entry.payout?.payoutAmount ?? 0) > 0 ? (
                            <span className="font-medium">
                              {formatNumber(entry.payout?.payoutAmount ?? 0)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatNumber(entry.tenant.commissionAmount)}
                      </TableCell>
                      <TableCell>
                        {entryTiers.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {entryTiers.map((tier, i) => (
                              <Badge key={i} variant="secondary" className="text-[10px]">
                                {MEGA645_PRIZE_TIER_LABELS[tier.tier as PrizeTier] ?? tier.tier}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            status === "settled"
                              ? "default"
                              : status === "void"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {ENTRY_STATUS_LABELS[status] ?? status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <EntryDetailDialog
        entry={selectedEntry}
        open={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
    </>
  );
}

// Alias internal — giữ backward compat với EntryList
const EntryDetailDialog = Mega645EntryDetailDialog;
