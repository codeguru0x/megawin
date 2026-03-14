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
import type { TicketEntryEntity } from "@megawin/game-keno/entities";
import { useKenoEntries } from "../use-report-queries";

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
  const tiers = (entry.payout as any)?.boardPayouts ?? [];
  const sideBets = (entry.payout as any)?.sideBetPayouts ?? [];
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Chi tiết Entry — Keno</DialogTitle>
          <DialogDescription>
            {entry.id} · {entry.drawId}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Kỳ quay", value: entry.drawId },
              { label: "Tiền cược", value: formatVND(entry.amount) },
              { label: "Tiền thắng", value: formatVND((entry.payout as any)?.winAmount ?? 0) },
              { label: "Trả thưởng", value: formatVND((entry.payout as any)?.payoutAmount ?? 0) },
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
          {tiers.length > 0 && (
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-xs text-muted-foreground">Boards trúng</p>
              <div className="space-y-1.5">
                {tiers
                  .filter((t: any) => t.winAmount > 0)
                  .map((tier: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <Badge variant="secondary">
                        pick{tier.pickCount}/{tier.matchCount}
                      </Badge>
                      <span className="tabular-nums text-success">{formatVND(tier.winAmount)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
          {sideBets.length > 0 && (
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-xs text-muted-foreground">Side bets trúng</p>
              <div className="space-y-1.5">
                {sideBets
                  .filter((t: any) => t.winAmount > 0)
                  .map((bet: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <Badge variant="secondary">
                        {bet.playType}: {bet.bet}
                      </Badge>
                      <span className="tabular-nums text-success">{formatVND(bet.winAmount)}</span>
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
  const { data, isLoading, error } = useKenoEntries(drawId, tenantId, accountId);
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
  const totalPayout = data.reduce((s, e) => s + ((e.payout as any)?.payoutAmount ?? 0), 0);
  const payout = (e: TicketEntryEntity) => e.payout as any;
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
                  <TableHead>Entry ID</TableHead>
                  <TableHead className="text-right">Boards</TableHead>
                  <TableHead className="text-right">Cược</TableHead>
                  <TableHead className="text-right">Thắng</TableHead>
                  <TableHead className="text-right">Trả thưởng</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((entry) => {
                  const p = payout(entry);
                  const winAmount = p?.winAmount ?? 0;
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-xs">
                        {entry.id.slice(-8)}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {formatNumber(
                          ((p as any)?.boardPayouts?.length ?? 0) +
                            ((p as any)?.sideBetPayouts?.length ?? 0),
                        )}
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
                          formatVND(p?.payoutAmount ?? 0)
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
