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
import type { TicketEntryEntity } from "@megawin/game-bingo18/entities";
import { useBingo18Entries } from "../use-report-queries";

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
  const p = entry.payout as any;
  const boards = p?.boardPayouts ?? [];
  const sideBets = p?.sideBetPayouts ?? [];
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Chi tiết Entry — Bingo 18</DialogTitle>
          <DialogDescription>
            {entry.id} · {entry.drawId}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Kỳ quay", value: entry.drawId },
              { label: "Tiền cược", value: formatVND(entry.amount) },
              { label: "Thắng", value: formatVND(p?.winAmount ?? 0) },
              { label: "Trả thưởng", value: formatVND(p?.payoutAmount ?? 0) },
            ].map((item) => (
              <div key={item.label} className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="text-sm font-bold">{item.value}</p>
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
          {boards.filter((b: any) => b.winAmount > 0).length > 0 && (
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-xs text-muted-foreground">Boards trúng</p>
              <div className="space-y-1">
                {boards
                  .filter((b: any) => b.winAmount > 0)
                  .map((b: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <Badge variant="secondary">{b.playType}</Badge>
                      <span className="text-success tabular-nums">{formatVND(b.winAmount)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
          {sideBets.filter((s: any) => s.winAmount > 0).length > 0 && (
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-xs text-muted-foreground">Side bets trúng</p>
              <div className="space-y-1">
                {sideBets
                  .filter((s: any) => s.winAmount > 0)
                  .map((s: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <Badge variant="secondary">
                        {s.playType}: {s.bet ?? s.sum}
                      </Badge>
                      <span className="text-success tabular-nums">{formatVND(s.winAmount)}</span>
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
  const { data, isLoading, error } = useBingo18Entries(drawId, tenantId, accountId);
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
  if (error || !data)
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">Lỗi.</CardContent>
      </Card>
    );
  const payout = (e: TicketEntryEntity) => e.payout as any;
  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Entries — {accountId}</CardTitle>
          <CardDescription className="text-xs">
            {data.length} entries · {drawId}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead className="text-right">Cược</TableHead>
                  <TableHead className="text-right">Thắng</TableHead>
                  <TableHead className="text-right">Trả</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((entry) => {
                  const p = payout(entry);
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-xs">
                        {entry.id.slice(-8)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatVND(entry.amount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {entry.status === "settled" ? (
                          p?.winAmount > 0 ? (
                            <span className="text-success">{formatVND(p.winAmount)}</span>
                          ) : (
                            <span className="text-muted-foreground">0 ₫</span>
                          )
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {entry.status === "settled" ? formatVND(p?.payoutAmount ?? 0) : "—"}
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
