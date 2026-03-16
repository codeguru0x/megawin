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
import { useMax3DProReportFilters } from "../use-report-filters";
import { useMax3DProTenantList, useMax3DProTenantDraws } from "../use-report-queries";

function TenantSummaryTable() {
  const { from, to, navigateToTenantDrills } = useMax3DProReportFilters();

  const { data, isLoading, error } = useMax3DProTenantList(from, to);

  if (isLoading) {
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
  }

  if (error) {
    return (
      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Building2 className="size-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-sm font-semibold">Lỗi tải dữ liệu</h3>
          <p className="mt-1 text-xs text-muted-foreground">Vui lòng tải lại trang và thử lại.</p>
        </CardContent>
      </Card>
    );
  }

  if (!data?.length) {
    return (
      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Building2 className="size-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-sm font-semibold">Không có dữ liệu</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Không có dữ liệu trong khoảng thời gian đã chọn.
          </p>
        </CardContent>
      </Card>
    );
  }

  const totals = {
    entries: data.reduce((s, r) => s + r.entryCount, 0),
    lines: data.reduce((s, r) => s + r.lineCount, 0),
    stake: data.reduce((s, r) => s + r.totalStake, 0),
    payout: data.reduce((s, r) => s + r.totalPayout, 0),
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
        <CardDescription className="text-xs">
          {data.length} đại lý · Sắp xếp theo doanh thu. Click để xem chi tiết kỳ quay.
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
                <TableHead className="text-right">Cặp</TableHead>
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
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.lineCount)}
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

        {/* Summary footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3 text-xs font-medium">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">TỔNG CỘNG</span>
            <Badge variant="secondary">{data.length} đại lý</Badge>
            <Badge variant="secondary">{formatNumber(totals.entries)} entries</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-4 tabular-nums">
            <span>
              DT: <strong title={formatVND(totals.stake)}>{formatVNDCompact(totals.stake)}</strong>
            </span>
            <span>
              PO:{" "}
              <strong title={formatVND(totals.payout)}>{formatVNDCompact(totals.payout)}</strong>
            </span>
            <span>
              GGR: <strong title={formatVND(totals.ggr)}>{formatVNDCompact(totals.ggr)}</strong>
            </span>
            <span>
              HH:{" "}
              <strong title={formatVND(totals.commission)}>
                {formatVNDCompact(totals.commission)}
              </strong>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Level 2: Tenant Draw List ────────────────────────────────────────────────

function TenantDrawList({ tenantId }: { tenantId: string }) {
  const { from, to, setTab, navigateToDraw, navigateToTenantInDraw } = useMax3DProReportFilters();

  const { data, isLoading, error } = useMax3DProTenantDraws(tenantId, from, to);

  if (isLoading) {
    return (
      <Card className="gap-0 py-0">
        <CardContent className="p-0">
          <div className="space-y-0">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="border-b px-5 py-3">
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <CalendarRange className="size-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-sm font-semibold">Lỗi tải dữ liệu</h3>
          <p className="mt-1 text-xs text-muted-foreground">Vui lòng tải lại trang và thử lại.</p>
        </CardContent>
      </Card>
    );
  }

  if (!data?.data.length) {
    return (
      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <CalendarRange className="size-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-sm font-semibold">Không có dữ liệu</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Không có kỳ quay nào cho đại lý này trong khoảng thời gian đã chọn.
          </p>
        </CardContent>
      </Card>
    );
  }

  const rows = data.data;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <CalendarRange className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Kỳ quay — {tenantId}</CardTitle>
        </div>
        <CardDescription className="text-xs">
          {data.total} kỳ quay · Click để xem players
        </CardDescription>
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
                <TableHead className="text-right">Cặp</TableHead>
                <TableHead className="text-right">Doanh thu</TableHead>
                <TableHead className="text-right">Trả thưởng</TableHead>
                <TableHead className="text-right">GGR</TableHead>
                <TableHead className="text-right">Hoa hồng</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.drawId}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => {
                    // Chuyển sang tab "draws" và drill vào draw → tenant
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
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.lineCount ?? 0)}
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

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function Breadcrumb() {
  const { tenantId, navigateToList } = useMax3DProReportFilters();

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

// ─── Main Tab ─────────────────────────────────────────────────────────────────

/** Tab "Theo Đại Lý" — 2 cấp drill-down. Max 3D Pro: có Cặp (lineCount), bỏ JP Contribution. */
export function ByTenantTab() {
  const { level, tenantId } = useMax3DProReportFilters();

  return (
    <div className="flex flex-col gap-4">
      {level !== "list" && <Breadcrumb />}

      {/* level list: không có tenantId */}
      {level === "list" && <TenantSummaryTable />}

      {/* level tenant-draws: có tenantId nhưng không có drawId */}
      {level === "tenant-draws" && tenantId && <TenantDrawList tenantId={tenantId} />}
    </div>
  );
}
