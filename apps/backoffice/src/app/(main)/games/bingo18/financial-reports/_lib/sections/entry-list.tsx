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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber } from "@megawin/shared/utils/number";
import { REPORT_COLUMN_LABELS, ENTRY_STATUS_LABELS } from "@megawin/game-core/labels";
import { parseUsername } from "@megawin/identity-application/shared";
import type { TicketEntryEntity } from "@megawin/game-bingo18/entities";
import { useBingo18Entries } from "../use-report-queries";
import { TableSkeleton, ErrorCard, EmptyCard } from "./shared-states";

// ─── Bingo 18 Play Type Labels ─────────────────────────────────────────────────

const BINGO18_PLAY_TYPE_LABELS: Record<string, string> = {
  singleNum: "Một số",
  doubleMatch: "Hai số trùng",
  tripleMatch: "Ba số trùng",
  sumTotal: "Cộng tổng",
  bigSmallDraw: "Lớn/Hòa/Nhỏ",
};

const BINGO18_BET_LABELS: Record<string, string> = {
  big: "Lớn",
  small: "Nhỏ",
  draw: "Hòa",
  specific: "Cụ thể",
  any: "Bất kỳ",
};

// ─── Entry Detail Dialog ──────────────────────────────────────────────────────

/** Chi tiết 1 entry Bingo 18 — 3 xúc xắc, boards cơ bản + side bets. */
export function Bingo18EntryDetailDialog({
  entry,
  open,
  onClose,
}: {
  entry: TicketEntryEntity | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!entry) return null;

  const p = entry.payout as any;
  const boards: any[] = p?.boardPayouts ?? [];
  const sideBets: any[] = p?.sideBetPayouts ?? [];
  const winAmount: number = p?.winAmount ?? 0;
  const payoutAmount: number = p?.payoutAmount ?? 0;
  // scheduled = đang chờ kết quả — KHÔNG hiển thị lãi/lỗ
  const isScheduled = entry.status === "scheduled";
  const playerNet = isScheduled ? null : payoutAmount - entry.amount;

  const drawResult: number[] = (entry as any).result?.numbers ?? [];
  const drawSum: number = (entry as any).result?.sum ?? 0;

  const displayName =
    parseUsername((entry as any).accountId ?? "") || ((entry as any).accountId ?? "");
  const isLongName = displayName.length > 20;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Chi tiết Entry — Bingo 18</DialogTitle>
          <DialogDescription>
            {entry.entrySummary?.ticketNo || entry.id} · {entry.drawId}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[72vh]">
          <div className="space-y-5 pr-2">
            {/* Thông tin cơ bản */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Tài khoản</p>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p
                        className={`text-sm font-bold ${isLongName ? "max-w-40 truncate" : ""}`}
                      >
                        {displayName}
                      </p>
                    </TooltipTrigger>
                    {isLongName && (
                      <TooltipContent>
                        <p>{(entry as any).accountId}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">{REPORT_COLUMN_LABELS.drawId}</p>
                <p className="font-mono text-sm font-bold">{entry.drawId}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Đại lý</p>
                <p className="text-sm font-bold">{entry.tenantId}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Trạng thái</p>
                <Badge
                  variant={
                    entry.status === "settled"
                      ? "default"
                      : entry.status === "void"
                        ? "destructive"
                        : "secondary"
                  }
                  className="mt-0.5"
                >
                  {ENTRY_STATUS_LABELS[entry.status as keyof typeof ENTRY_STATUS_LABELS] ??
                    entry.status}
                </Badge>
              </div>
            </div>

            {/* Trạng thái đang chờ */}
            {isScheduled && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
                <Badge variant="secondary">Đang chờ quay số</Badge>
                <p className="text-xs text-muted-foreground">
                  Kết quả sẽ có sau kỳ quay · {entry.drawId}
                </p>
              </div>
            )}

            {/* Tài chính */}
            <div className={`grid gap-3 ${isScheduled ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Tiền cược</p>
                <p className="text-sm font-bold tabular-nums">{formatNumber(entry.amount)}</p>
              </div>
              {!isScheduled && (
                <>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Tiền thắng</p>
                    <p className="text-sm font-bold tabular-nums">{formatNumber(winAmount)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">{REPORT_COLUMN_LABELS.totalPayout}</p>
                    <p className="text-sm font-bold tabular-nums">{formatNumber(payoutAmount)}</p>
                  </div>
                </>
              )}
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Hoa hồng đại lý</p>
                <p className="text-sm font-bold tabular-nums">
                  {formatNumber(entry.tenant.commissionAmount)}
                </p>
              </div>
            </div>

            {/* Lãi/Lỗ khách hàng — chỉ hiển thị sau khi settle/void */}
            {playerNet !== null && (
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Lãi / Lỗ (khách hàng)</span>
                  <span
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
                  </span>
                </div>
              </div>
            )}

            {/* Kết quả — 3 xúc xắc */}
            {drawResult.length > 0 && (
              <div className="rounded-lg border p-3">
                <p className="mb-3 text-xs font-semibold text-muted-foreground">
                  Kết quả — {entry.drawId}
                </p>
                <div className="flex items-center justify-center gap-3">
                  {drawResult.map((num, i) => (
                    <span
                      key={i}
                      className="inline-flex size-10 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground shadow"
                    >
                      {num}
                    </span>
                  ))}
                  {drawSum > 0 && (
                    <span className="ml-2 text-sm text-muted-foreground">Tổng: {drawSum}</span>
                  )}
                </div>
              </div>
            )}

            {/* Boards cơ bản */}
            {boards.length > 0 && (
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Cách chơi cơ bản</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loại</TableHead>
                      <TableHead>Chọn số</TableHead>
                      <TableHead className="text-right">Kết quả</TableHead>
                      <TableHead className="text-right">Tiền thắng</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {boards.map((board: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">
                          {BINGO18_PLAY_TYPE_LABELS[board.playType] ?? board.playType}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-muted font-bold">
                            {board.selectedNumber ?? board.kind ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {board.winAmount > 0 ? (
                            <Badge className="bg-profit text-profit-foreground text-xs">
                              Trúng ×{board.matchCount ?? 1}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {board.winAmount > 0 ? (
                            <span className="font-bold text-profit">
                              +{formatNumber(board.winAmount)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Side bets */}
            {sideBets.length > 0 && (
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  Cách chơi bổ sung
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loại</TableHead>
                      <TableHead>Cược</TableHead>
                      <TableHead className="text-right">Kết quả</TableHead>
                      <TableHead className="text-right">Tiền thắng</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sideBets.map((bet: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">
                          {BINGO18_PLAY_TYPE_LABELS[bet.playType] ?? bet.playType}
                        </TableCell>
                        <TableCell className="text-xs">
                          {bet.playType === "sumTotal"
                            ? `Tổng ${bet.sum ?? bet.bet}`
                            : (BINGO18_BET_LABELS[bet.bet] ?? bet.bet)}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {bet.winAmount > 0 ? (
                            <Badge className="bg-profit text-profit-foreground text-xs">
                              Trúng
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {bet.winAmount > 0 ? (
                            <span className="font-bold text-profit">
                              +{formatNumber(bet.winAmount)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ─── Entry List ───────────────────────────────────────────────────────────────

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
  const { data, isLoading, error } = useBingo18Entries(drawId, tenantId, accountId);

  const parsed = parseUsername(playerDisplayName ?? accountId);
  const playerLabel = parsed ? parsed.playerExternalId : accountId;

  if (isLoading) return <TableSkeleton rows={5} />;
  if (error) return <ErrorCard message="Lỗi tải entries." />;
  if (!data?.length) return <EmptyCard icon="ticket" message="Không có entry nào." />;

  const payout = (e: TicketEntryEntity) => e.payout as any;

  return (
    <>
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pb-2 pt-4">
          <div className="flex items-center gap-2">
            <Ticket className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Entries — {playerLabel}</CardTitle>
          </div>
          <CardDescription className="text-xs">
            {data.length} entries · Kỳ {drawId} · {tenantId}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã vé</TableHead>
                  <TableHead className="text-right">Tiền cược</TableHead>
                  <TableHead className="text-right">Tiền thắng</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((entry) => {
                  const p = payout(entry);
                  const winAmount = p?.winAmount ?? 0;
                  const payoutAmount = p?.payoutAmount ?? 0;
                  return (
                    <TableRow
                      key={entry.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedEntry(entry)}
                    >
                      <TableCell>
                        <button className="font-mono text-xs text-primary underline-offset-2 hover:underline">
                          {entry.id.slice(-8)}
                        </button>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNumber(entry.amount)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {entry.status === "settled" ? (
                          winAmount > 0 ? (
                            <span className="font-medium text-profit">
                              {formatNumber(winAmount)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {entry.status === "settled" ? (
                          formatNumber(payoutAmount)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            entry.status === "settled"
                              ? "default"
                              : entry.status === "void"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {ENTRY_STATUS_LABELS[entry.status as keyof typeof ENTRY_STATUS_LABELS] ??
                            entry.status}
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

const EntryDetailDialog = Bingo18EntryDetailDialog;
