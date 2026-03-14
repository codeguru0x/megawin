"use client";

import { ChevronRight } from "lucide-react";
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
  formatVND,
  formatVNDCompact,
  formatPercent,
  formatNumber,
} from "@megawin/shared/utils/number";
import { useKenoReportFilters } from "../use-report-filters";
import { useKenoTenantList, useKenoTenantDraws } from "../use-report-queries";

function TenantSummaryTable() {
  const { from, to, navigateToTenantDrills } = useKenoReportFilters();
  const { data, isLoading, error } = useKenoTenantList(from, to);
  if (isLoading)
    return (
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  if (error || !data?.length)
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {error ? "Lỗi tải dữ liệu." : "Không có dữ liệu."}
        </CardContent>
      </Card>
    );
  const totals = {
    stake: data.reduce((s, r) => s + r.totalStake, 0),
    payout: data.reduce((s, r) => s + r.totalPayout, 0),
    ggr: data.reduce((s, r) => s + r.ggr, 0),
    commission: data.reduce((s, r) => s + r.commission, 0),
  };
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Tổng hợp theo đại lý</CardTitle>
        <CardDescription className="text-xs">
          {data.length} đại lý · Keno không có lineCount
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Đại lý</TableHead>
                <TableHead className="text-right">Kỳ quay</TableHead>
                <TableHead className="text-right">Entries</TableHead>
                <TableHead className="text-right">Players</TableHead>
                <TableHead className="text-right">Doanh thu</TableHead>
                <TableHead className="text-right">Trả thưởng</TableHead>
                <TableHead className="text-right">GGR</TableHead>
                <TableHead className="text-right">Hoa hồng</TableHead>
                <TableHead className="text-right">Payout %</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, idx) => {
                const payoutPct = row.totalStake > 0 ? row.totalPayout / row.totalStake : 0;
                return (
                  <TableRow
                    key={row.tenantId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigateToTenantDrills(row.tenantId)}
                  >
                    <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell>
                      <p className="font-medium">{row.tenantId}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.drawCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.entryCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.playerCount)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatVND(row.totalStake)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${payoutPct > 0.95 ? "text-danger" : ""}`}
                    >
                      {formatVND(row.totalPayout)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatVND(row.ggr)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatVND(row.commission)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={payoutPct > 0.95 ? "destructive" : "secondary"}>
                        {formatPercent(payoutPct)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3 text-xs font-medium">
          <span className="text-muted-foreground">{data.length} đại lý</span>
          <div className="flex flex-wrap gap-4 tabular-nums">
            <span>
              DT: <strong>{formatVNDCompact(totals.stake)}</strong>
            </span>
            <span>
              GGR: <strong>{formatVNDCompact(totals.ggr)}</strong>
            </span>
            <span>
              HH: <strong>{formatVNDCompact(totals.commission)}</strong>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TenantDrawList({ tenantId }: { tenantId: string }) {
  const { from, to, setTab, navigateToDraw, navigateToTenantInDraw } = useKenoReportFilters();
  const { data, isLoading, error } = useKenoTenantDraws(tenantId, from, to);
  if (isLoading)
    return (
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-2">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  if (error || !data?.data.length)
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          {error ? "Lỗi tải dữ liệu." : "Không có kỳ quay nào."}
        </CardContent>
      </Card>
    );
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Kỳ quay — {tenantId}</CardTitle>
        <CardDescription className="text-xs">{data.total} kỳ quay</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kỳ quay</TableHead>
                <TableHead>Ngày TC</TableHead>
                <TableHead className="text-right">Entries</TableHead>
                <TableHead className="text-right">Players</TableHead>
                <TableHead className="text-right">Doanh thu</TableHead>
                <TableHead className="text-right">Trả thưởng</TableHead>
                <TableHead className="text-right">GGR</TableHead>
                <TableHead className="text-right">Hoa hồng</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((row) => (
                <TableRow
                  key={row.drawId}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => {
                    void setTab("draws");
                    navigateToDraw(row.drawId);
                    navigateToTenantInDraw(row.tenantId);
                  }}
                >
                  <TableCell className="font-mono text-xs">{row.drawId}</TableCell>
                  <TableCell className="text-sm">{row.financialDate}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.entryCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.playerCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatVND(row.totalStake)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatVND(row.totalPayout)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatVND(row.ggr)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatVND(row.commission)}
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Breadcrumb() {
  const { tenantId, navigateToList } = useKenoReportFilters();
  return (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      <Button
        variant="ghost"
        size="sm"
        className="h-auto px-2 py-1 text-xs"
        onClick={navigateToList}
      >
        Đại lý
      </Button>
      {tenantId && (
        <>
          <ChevronRight className="size-3 text-muted-foreground" />
          <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">{tenantId}</span>
        </>
      )}
    </div>
  );
}

export function ByTenantTab() {
  const { level, tenantId } = useKenoReportFilters();
  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb />
      {level === "list" && <TenantSummaryTable />}
      {level === "tenant-draws" && tenantId && <TenantDrawList tenantId={tenantId} />}
    </div>
  );
}
