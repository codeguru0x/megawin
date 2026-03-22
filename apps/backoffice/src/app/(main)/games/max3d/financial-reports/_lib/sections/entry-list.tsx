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
import type { TicketEntryEntity } from "@megawin/game-max3d/entities";
import { useMax3DEntries } from "../use-report-queries";
import { TableSkeleton, ErrorCard, EmptyCard } from "./shared-states";

// ─── Max 3D Prize Tier Labels ─────────────────────────────────────────────────

const MAX3D_BASIC_PRIZE_LABELS: Record<string, string> = {
  special: "Giải Đặc Biệt",
  first: "Giải Nhất",
  second: "Giải Nhì",
  third: "Giải Ba",
};

const MAX3D_PLUS_PRIZE_LABELS: Record<string, string> = {
  special: "Giải Đặc Biệt",
  first: "Giải Nhất",
  second: "Giải Nhì",
  third: "Giải Ba",
  fourth: "Giải Tư",
  fifth: "Giải Năm",
  sixth: "Giải Sáu",
};

// ─── Entry Detail Dialog ──────────────────────────────────────────────────────

/** Chi tiết 1 entry Max 3D — bộ ba số, play mode (basic/plus), giải trúng. */
export function Max3dEntryDetailDialog({
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
  const winAmount = entry.payout?.winAmount ?? 0;
  const payoutAmount = entry.payout?.payoutAmount ?? 0;
  // scheduled = đang chờ kết quả — KHÔNG hiển thị lãi/lỗ
  const isScheduled = entry.status === "scheduled";
  const playerNet = isScheduled ? null : payoutAmount - entry.amount;

  const displayName = parseUsername(entry.username)?.playerExternalId || (entry.accountId ?? "");
  const isLongName = displayName.length > 20;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Chi tiết Entry — Max 3D</DialogTitle>
          <DialogDescription>
            {entry.entrySummary.ticketNo} · {entry.drawId}
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
                <p className="text-sm font-bold">{entry.tenantId ?? ""}</p>
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
                <p className="text-xs text-muted-foreground">{REPORT_COLUMN_LABELS.lineCount}</p>
                <p className="text-sm font-bold tabular-nums">{formatNumber(entry.lineCount)}</p>
              </div>
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

            {/* Giải trúng */}
            {tiers.length > 0 && (
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Giải trúng</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hạng giải</TableHead>
                      <TableHead className="text-right">Số lần</TableHead>
                      <TableHead className="text-right">Đơn giá</TableHead>
                      <TableHead className="text-right">Tổng thưởng</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tiers.map((tier, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Badge className="bg-profit text-profit-foreground text-xs">
                            {MAX3D_BASIC_PRIZE_LABELS[tier.tier] ??
                              MAX3D_PLUS_PRIZE_LABELS[tier.tier] ??
                              tier.tier}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          ×{tier.hitCount}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {formatNumber(tier.unitAmount ?? 0)}
                        </TableCell>
                        <TableCell className="text-right text-sm font-bold tabular-nums text-profit">
                          +{formatNumber(tier.amount)}
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
  const { data, isLoading, error } = useMax3DEntries(drawId, tenantId, accountId);

  const parsed = parseUsername(playerDisplayName ?? accountId);
  const playerLabel = parsed ? parsed.playerExternalId : accountId;

  if (isLoading) return <TableSkeleton rows={5} />;
  if (error) return <ErrorCard message="Lỗi tải entries." />;
  if (!data?.length) return <EmptyCard icon="ticket" message="Không có entry nào." />;

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
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.lineCount}</TableHead>
                  <TableHead className="text-right">Tiền cược</TableHead>
                  <TableHead className="text-right">Tiền thắng</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                  <TableHead>Giải cao nhất</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((entry) => {
                  const winAmount = entry.payout?.winAmount ?? 0;
                  const payoutAmount = entry.payout?.payoutAmount ?? 0;
                  const tiers = entry.payout?.tiers ?? [];
                  const topTier = tiers[0];
                  return (
                    <TableRow
                      key={entry.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedEntry(entry)}
                    >
                      <TableCell>
                        <button className="font-mono text-xs text-primary underline-offset-2 hover:underline">
                          {entry.entrySummary.ticketNo}
                        </button>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatNumber(entry.lineCount)}
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
                        {topTier ? (
                          <Badge variant="secondary" className="text-xs">
                            {MAX3D_BASIC_PRIZE_LABELS[topTier.tier] ??
                              MAX3D_PLUS_PRIZE_LABELS[topTier.tier] ??
                              topTier.tier}
                            {tiers.length > 1 ? ` +${tiers.length - 1}` : ""}
                          </Badge>
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

const EntryDetailDialog = Max3dEntryDetailDialog;
