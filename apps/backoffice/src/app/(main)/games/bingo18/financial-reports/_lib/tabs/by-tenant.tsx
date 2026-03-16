"use client";

import { ChevronRight, Building2, CalendarRange } from "lucide-react";
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
import { useBingo18ReportFilters } from "../use-report-filters";
import { useBingo18TenantList, useBingo18TenantDraws } from "../use-report-queries";

function TenantSummaryTable() {
  const { from, to, navigateToTenantDrills } = useBingo18ReportFilters();
  const { data, isLoading, error } = useBingo18TenantList(from, to);
  if (isLoading)
    return (
      <Card className="gap-0 py-0">
        <CardContent className="p-0">
          <div className="space-y-0">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="border-b px-5 py-3">
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  if (error || !data?.length)
    return (
      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Building2 className="size-6 text-muted-foreground" />
          </div>
          {error ? (
            <>
              <h3 className="mt-4 text-sm font-semibold">Lỗi tải dữ liệu</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Vui lòng tải lại trang và thử lại.
              </p>
            </>
          ) : (
            <>
              <h3 className="mt-4 text-sm font-semibold">Không có dữ liệu</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Không có dữ liệu trong khoảng thời gian đã chọn.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    );
  const totals = {
    stake: data.reduce((s, r) => s + r.totalStake, 0),
    ggr: data.reduce((s, r) => s + r.ggr, 0),
    commission: data.reduce((s, r) => s + r.totalCommission, 0),
  };
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Tổng hợp theo đại lý</CardTitle>
        </div>
        <CardDescription className="text-xs">{data.length} đại lý</CardDescription>
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
                    <TableCell className="font-medium">{row.tenantId}</TableCell>
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
                    <TableCell className="text-right tabular-nums">
                      {formatVND(row.totalPayout)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatVND(row.ggr)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatVND(row.totalCommission)}
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
          <div className="flex gap-4 tabular-nums">
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
  const { from, to, setTab, navigateToDraw, navigateToTenantInDraw } = useBingo18ReportFilters();
  const { data, isLoading } = useBingo18TenantDraws(tenantId, from, to);
  if (isLoading)
    return (
      <Card className="gap-0 py-0">
        <CardContent className="p-0">
          <div className="space-y-0">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="border-b px-5 py-3">
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  if (!data?.data.length)
    return (
      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <CalendarRange className="size-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-sm font-semibold">Không có dữ liệu</h3>
          <p className="mt-1 text-xs text-muted-foreground">Không có dữ liệu.</p>
        </CardContent>
      </Card>
    );
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <CalendarRange className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Kỳ quay — {tenantId}</CardTitle>
        </div>
        <CardDescription className="text-xs">{data.total} kỳ</CardDescription>
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
                  <TableCell>{row.financialDate}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.entryCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.playerCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatVND(row.totalStake)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatVND(row.totalPayout)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatVND(row.ggr)}</TableCell>
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

export function ByTenantTab() {
  const { level, tenantId, navigateToList } = useBingo18ReportFilters();
  return (
    <div className="flex flex-col gap-4">
      {level !== "list" && (
        <div className="flex items-center gap-1">
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
              <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">
                {tenantId}
              </span>
            </>
          )}
        </div>
      )}
      {level === "list" && <TenantSummaryTable />}
      {level === "tenant-draws" && tenantId && <TenantDrawList tenantId={tenantId} />}
    </div>
  );
}
