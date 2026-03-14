"use client";

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
import { Building2, ChevronDown, ChevronRight } from "lucide-react";
import {
  formatVND,
  formatVNDCompact,
  formatPercent,
  formatNumber,
} from "@megawin/shared/utils/number";
import type { TenantSummaryRow } from "@megawin/game-core-application/repos";
import type { SystemSettleTenantDaily } from "@megawin/game-core/entities";
import { GAME_LABELS } from "@megawin/game-core/labels";
import { useSystemReportFilters } from "../use-report-filters";
import { useSystemByTenant, useSystemTenantBreakdown } from "../use-report-queries";

// ─── Tenant Breakdown (inline expand) ────────────────────────────────────────

function TenantBreakdownRows({
  tenantId,
  from,
  to,
}: {
  tenantId: string;
  from: string;
  to: string;
}) {
  const { data, isLoading } = useSystemTenantBreakdown(tenantId, from, to);

  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={11} className="py-2 pl-12">
          <Skeleton className="h-4 w-48" />
        </TableCell>
      </TableRow>
    );
  }

  if (!data || data.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={11} className="py-3 pl-12 text-sm text-muted-foreground">
          Không có dữ liệu.
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      {data.map((row) => (
        <TableRow key={`${row.tenantId}-${row.gameProduct}`} className="bg-muted/30">
          <TableCell colSpan={2} className="pl-12 text-xs">
            <span className="font-medium text-muted-foreground">
              {GAME_LABELS[row.gameProduct as keyof typeof GAME_LABELS] ?? row.gameProduct}
            </span>
          </TableCell>
          <TableCell className="text-right tabular-nums text-xs">
            {formatNumber(row.drawCount)}
          </TableCell>
          <TableCell className="text-right tabular-nums text-xs">
            {formatNumber(row.entryCount)}
          </TableCell>
          <TableCell className="text-right tabular-nums text-xs">
            {formatNumber(row.playerCount)}
          </TableCell>
          <TableCell className="text-right tabular-nums text-xs">
            {formatVND(row.totalStake)}
          </TableCell>
          <TableCell className="text-right tabular-nums text-xs text-danger">
            {formatVND(row.totalPayout)}
          </TableCell>
          <TableCell className="text-right tabular-nums text-xs">{formatVND(row.ggr)}</TableCell>
          <TableCell className="text-right tabular-nums text-xs">
            {formatVND(row.commission)}
          </TableCell>
          <TableCell
            className={`text-right tabular-nums text-xs font-medium ${row.netProfit >= 0 ? "text-success" : "text-danger"}`}
          >
            {formatVND(row.netProfit)}
          </TableCell>
          <TableCell className="text-right tabular-nums text-xs">
            {row.totalStake > 0 ? formatPercent(row.totalPayout / row.totalStake) : "—"}
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

/** Tab "Theo đại lý" — aggregate by tenantId. */
export function ByTenantTab() {
  const { from, to, expandedTenant, setExpandedTenant } = useSystemReportFilters();

  const { data, isLoading, error } = useSystemByTenant(from, to);

  if (isLoading) return <ByTenantSkeleton />;
  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Lỗi tải dữ liệu. Vui lòng thử lại.
        </CardContent>
      </Card>
    );
  }
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Không có dữ liệu trong khoảng thời gian đã chọn.
        </CardContent>
      </Card>
    );
  }

  // Summary
  const totalStake = data.reduce((s, r) => s + r.totalStake, 0);
  const totalPayout = data.reduce((s, r) => s + r.totalPayout, 0);
  const totalGgr = data.reduce((s, r) => s + r.ggr, 0);
  const totalCommission = data.reduce((s, r) => s + r.commission, 0);
  const totalNetProfit = data.reduce((s, r) => s + r.netProfit, 0);
  const totalEntries = data.reduce((s, r) => s + r.entryCount, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Xếp hạng đại lý</CardTitle>
        <CardDescription className="text-xs">
          Sắp xếp theo doanh thu giảm dần · Click để xem game breakdown
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-center">#</TableHead>
                <TableHead className="w-8" />
                <TableHead>Đại lý</TableHead>
                <TableHead className="text-right">Games</TableHead>
                <TableHead className="text-right">Kỳ quay</TableHead>
                <TableHead className="text-right">Entries</TableHead>
                <TableHead className="text-right">Players</TableHead>
                <TableHead className="text-right">Doanh thu</TableHead>
                <TableHead className="text-right">Trả thưởng</TableHead>
                <TableHead className="text-right">GGR</TableHead>
                <TableHead className="text-right">Hoa hồng</TableHead>
                <TableHead className="text-right">Lợi nhuận</TableHead>
                <TableHead className="text-right">Payout %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, idx) => {
                const isExpanded = expandedTenant === row.tenantId;
                const payoutPct = row.totalStake > 0 ? row.totalPayout / row.totalStake : 0;
                return (
                  <>
                    <TableRow
                      key={row.tenantId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => void setExpandedTenant(isExpanded ? null : row.tenantId)}
                    >
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="w-8 text-center">
                        {isExpanded ? (
                          <ChevronDown className="size-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="size-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="size-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{row.tenantId}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Badge variant="outline">{row.gameCount}</Badge>
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
                        className={`text-right tabular-nums ${payoutPct > 0.95 ? "text-danger" : payoutPct > 0.8 ? "text-warning" : ""}`}
                      >
                        {formatVND(row.totalPayout)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatVND(row.ggr)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatVND(row.commission)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums font-medium ${row.netProfit >= 0 ? "text-success" : "text-danger"}`}
                      >
                        {formatVND(row.netProfit)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Badge
                          variant={
                            payoutPct > 0.95
                              ? "destructive"
                              : payoutPct > 0.8
                                ? "outline"
                                : "secondary"
                          }
                        >
                          {formatPercent(payoutPct)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TenantBreakdownRows tenantId={row.tenantId} from={from} to={to} />
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Summary Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3 text-sm font-medium">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">TỔNG CỘNG</span>
            <Badge variant="secondary">{data.length} đại lý</Badge>
            <Badge variant="secondary">{formatNumber(totalEntries)} entries</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-4 tabular-nums text-xs">
            <span>
              DT: <strong title={formatVND(totalStake)}>{formatVNDCompact(totalStake)}</strong>
            </span>
            <span>
              PO: <strong title={formatVND(totalPayout)}>{formatVNDCompact(totalPayout)}</strong>
            </span>
            <span>
              GGR: <strong title={formatVND(totalGgr)}>{formatVNDCompact(totalGgr)}</strong>
            </span>
            <span>
              HH:{" "}
              <strong title={formatVND(totalCommission)}>
                {formatVNDCompact(totalCommission)}
              </strong>
            </span>
            <span className={totalNetProfit >= 0 ? "text-success" : "text-danger"}>
              LN:{" "}
              <strong title={formatVND(totalNetProfit)}>{formatVNDCompact(totalNetProfit)}</strong>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ByTenantSkeleton() {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Suppress unused import
void Button;
