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
import { formatNumber } from "@megawin/shared/utils/number";
import {
  REPORT_COLUMN_LABELS,
  ENTRY_STATUS_LABELS,
  ENTRY_OUTCOME_LABELS,
} from "@megawin/game-core/labels";
import type { TicketEntryEntity } from "@megawin/game-lotto535/entities";
import { useLotto535Entries } from "../use-report-queries";
import { TableSkeleton, ErrorCard, EmptyCard } from "./shared-states";

// ─── Lotto 5/35 Prize Tier Labels ─────────────────────────────────────────────

const LOTTO535_PRIZE_TIER_LABELS: Record<string, string> = {
  jackpot: "Giải Độc Đắc",
  tier1: "Giải Nhất",
  tier2: "Giải Nhì",
  tier3: "Giải Ba",
  tier4: "Giải Tư",
  tier5: "Giải Năm",
  consolation: "Giải KK",
};

// ─── Entry Detail Dialog ──────────────────────────────────────────────────────

function EntryDetailDialog({
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
  const isWin = (entry.payout?.payoutAmount ?? 0) > 0;
  const playerNet = (entry.payout?.payoutAmount ?? 0) - entry.amount;
  const outcome = entry.result?.outcome as string | undefined;

  const winningMain = new Set<string>(entry.result?.winningMain ?? []);
  const winningSpecial = entry.result?.winningSpecial as string | undefined;

  const infoItems = [
    { label: "Mã vé", value: entry.entrySummary.ticketNo },
    { label: REPORT_COLUMN_LABELS.drawId, value: entry.drawId },
    { label: "Đại lý", value: entry.tenant.tenantId },
    { label: REPORT_COLUMN_LABELS.lineCount, value: formatNumber(entry.lineCount) },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Chi tiết Entry — Lotto 5/35</DialogTitle>
          <DialogDescription>
            {entry.entrySummary.ticketNo} · {entry.drawId}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[72vh]">
          <div className="space-y-4 pr-1">
            {/* Thông tin cơ bản */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {infoItems.map((item) => (
                <div key={item.label} className="min-w-0 rounded-lg bg-muted/50 p-3">
                  <p className="text-[11px] text-muted-foreground">{item.label}</p>
                  <p className="truncate text-sm font-bold" title={item.value}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Trạng thái & kết quả */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Trạng thái
              </p>
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
              {outcome && (
                <Badge
                  className={
                    isWin
                      ? "border-transparent bg-profit text-profit-foreground hover:bg-profit/80"
                      : ""
                  }
                  variant={outcome === "void" ? "destructive" : isWin ? "default" : "secondary"}
                >
                  {ENTRY_OUTCOME_LABELS[outcome as keyof typeof ENTRY_OUTCOME_LABELS] ?? outcome}
                </Badge>
              )}
            </div>

            {/* Tài chính */}
            <div className="grid grid-cols-4 gap-x-4 gap-y-2">
              <div>
                <p className="text-[11px] text-muted-foreground">Cược</p>
                <p className="text-sm font-bold tabular-nums">{formatNumber(entry.amount)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">
                  {REPORT_COLUMN_LABELS.totalPayout}
                </p>
                <p className={`text-sm font-bold tabular-nums ${isWin ? "text-profit" : ""}`}>
                  {formatNumber(entry.payout?.payoutAmount ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">
                  {REPORT_COLUMN_LABELS.totalCommission}
                </p>
                <p className="text-sm font-bold tabular-nums">
                  {formatNumber(entry.tenant.commissionAmount)}
                </p>
              </div>
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
            </div>

            {/* Kết quả quay — 5 số chính + 1 số đặc biệt */}
            {entry.result && (
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Kết quả — Kỳ {entry.drawId}
                </p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {entry.result.winningMain.map((n: string) => (
                    <span
                      key={n}
                      className="inline-flex size-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
                    >
                      {n}
                    </span>
                  ))}
                  {winningSpecial && (
                    <span
                      className="inline-flex size-8 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white"
                      title="Số đặc biệt"
                    >
                      {winningSpecial}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Bộ số đã chọn — highlight trùng kết quả */}
            {boards.length > 0 && (
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Bộ số đã chọn
                </p>
                <div className="space-y-2">
                  {boards.map(
                    (board: { main: string[]; special?: string; playType?: string }, i: number) => (
                      <div key={i} className="flex flex-wrap items-center gap-1.5">
                        <span className="w-5 text-[10px] font-semibold text-muted-foreground">
                          {String.fromCharCode(65 + i)}
                        </span>
                        {board.main.map((n: string) => (
                          <span
                            key={n}
                            className={`inline-flex size-7 items-center justify-center rounded-full text-[11px] font-bold ${
                              winningMain.has(n)
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {n}
                          </span>
                        ))}
                        {/* Số đặc biệt của board */}
                        {board.special && (
                          <span
                            className={`inline-flex size-7 items-center justify-center rounded-full text-[11px] font-bold ${
                              board.special === winningSpecial
                                ? "bg-amber-500 text-white"
                                : "bg-muted text-muted-foreground ring-1 ring-amber-400"
                            }`}
                            title="Số đặc biệt"
                          >
                            {board.special}
                          </span>
                        )}
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}

            {/* Giải trúng */}
            {tiers.length > 0 && (
              <div className="rounded-lg border border-profit/30 bg-profit/5 p-3">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-profit">
                  Giải trúng
                </p>
                <div className="space-y-1.5">
                  {tiers.map(
                    (tier: { tier: string; hitCount: number; amount: number }, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <Badge variant="secondary">
                          {LOTTO535_PRIZE_TIER_LABELS[tier.tier] ?? tier.tier}
                        </Badge>
                        <span className="tabular-nums font-semibold text-profit">
                          ×{tier.hitCount} · {formatNumber(tier.amount)}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ─── Entry List ───────────────────────────────────────────────────────────────

/** Cấp 4 drill-down: entries của 1 player × 1 draw × 1 tenant — Lotto 5/35. */
export function EntryList({
  drawId,
  tenantId,
  accountId,
}: {
  drawId: string;
  tenantId: string;
  accountId: string;
}) {
  const [selectedEntry, setSelectedEntry] = useState<TicketEntryEntity | null>(null);
  const { data, isLoading, error } = useLotto535Entries(drawId, tenantId, accountId);

  if (isLoading) return <TableSkeleton rows={5} />;
  if (error) return <ErrorCard />;
  if (!data?.length) return <EmptyCard msg="Không có entry nào." />;

  return (
    <>
      <Card className="gap-0 py-0">
        <CardHeader className="px-5 pb-2 pt-4">
          <div className="flex items-center gap-2">
            <Ticket className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Entries — {accountId}</CardTitle>
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
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.lineCount}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalStake}</TableHead>
                  <TableHead className="text-right">{REPORT_COLUMN_LABELS.totalPayout}</TableHead>
                  <TableHead>Giải</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((entry) => {
                  const tiers = entry.payout?.tiers ?? [];
                  const status = entry.status as string;

                  return (
                    <TableRow
                      key={entry.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedEntry(entry)}
                    >
                      <TableCell className="font-medium">{entry.entrySummary.ticketNo}</TableCell>
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
                      <TableCell>
                        {tiers.length > 0 ? (
                          <Badge variant="secondary">
                            {LOTTO535_PRIZE_TIER_LABELS[tiers[0]?.tier ?? ""] ?? tiers[0]?.tier}
                            {tiers.length > 1 ? ` +${tiers.length - 1}` : ""}
                          </Badge>
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
                          {ENTRY_STATUS_LABELS[status as keyof typeof ENTRY_STATUS_LABELS] ??
                            status}
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
