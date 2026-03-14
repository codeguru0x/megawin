"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatVND, formatNumber } from "@megawin/shared/utils/number";
import type { TicketEntryEntity } from "@megawin/game-mega645/entities";
import { useMega645Entries } from "../use-report-queries";

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
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Chi tiết Entry — Mega 6/45</DialogTitle>
          <DialogDescription>
            {entry.entrySummary.ticketNo} · {entry.drawId}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Kỳ quay", value: entry.drawId },
              { label: "Lines", value: formatNumber(entry.lineCount) },
              { label: "Tiền cược", value: formatVND(entry.amount) },
              { label: "Tiền thắng", value: formatVND(entry.payout?.winAmount ?? 0) },
              { label: "Trả thưởng", value: formatVND(entry.payout?.payoutAmount ?? 0) },
              { label: "Hoa hồng", value: formatVND(entry.tenant.commissionAmount) },
            ].map((item) => (
              <div key={item.label} className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="text-sm font-bold tabular-nums">{item.value}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm text-muted-foreground">Trạng thái</span>
            <Badge
              variant={
                entry.status === "settled"
                  ? "default"
                  : entry.status === "void"
                    ? "destructive"
                    : "secondary"
              }
            >
              {entry.status}
            </Badge>
          </div>
          {entry.result && (
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-xs text-muted-foreground">Kết quả quay</p>
              <div className="flex flex-wrap gap-1.5">
                {entry.result.winningMain.map((n) => (
                  <span
                    key={n}
                    className="inline-flex size-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          )}
          {tiers.length > 0 && (
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-xs text-muted-foreground">Giải trúng</p>
              <div className="space-y-1.5">
                {tiers.map((tier, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <Badge variant="secondary">{tier.tier}</Badge>
                    <span className="tabular-nums text-success">
                      ×{tier.hitCount} · {formatVND(tier.amount)}
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
  const { data, isLoading, error } = useMega645Entries(drawId, tenantId, accountId);
  if (isLoading)
    return (
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  if (error)
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Lỗi tải entries.
        </CardContent>
      </Card>
    );
  if (!data?.length)
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Không có entry nào.
        </CardContent>
      </Card>
    );
  const totalStake = data.reduce((s, e) => s + e.amount, 0);
  const totalPayout = data.reduce((s, e) => s + (e.payout?.payoutAmount ?? 0), 0);
  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Entries — {accountId}</CardTitle>
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
                  <TableHead className="text-center">Lines</TableHead>
                  <TableHead className="text-right">Cược</TableHead>
                  <TableHead className="text-right">Thắng</TableHead>
                  <TableHead className="text-right">Trả thưởng</TableHead>
                  <TableHead>Giải</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((entry) => {
                  const winAmount = entry.payout?.winAmount ?? 0;
                  const tiers = entry.payout?.tiers ?? [];
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-xs">
                        {entry.entrySummary.ticketNo}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {formatNumber(entry.lineCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatVND(entry.amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {entry.status === "settled" ? (
                          winAmount > 0 ? (
                            <span className="font-medium text-success">{formatVND(winAmount)}</span>
                          ) : (
                            <span className="text-muted-foreground">0 ₫</span>
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {entry.status === "settled" ? (
                          formatVND(entry.payout?.payoutAmount ?? 0)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {tiers.length > 0 ? (
                          <Badge variant="secondary">{tiers[0]?.tier}</Badge>
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
                          {entry.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => setSelectedEntry(entry)}
                        >
                          <Eye className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3 text-xs font-medium">
            <span className="text-muted-foreground">{data.length} entries</span>
            <div className="flex gap-4 tabular-nums">
              <span>
                Cược: <strong>{formatVND(totalStake)}</strong>
              </span>
              <span>
                Trả: <strong>{formatVND(totalPayout)}</strong>
              </span>
            </div>
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
