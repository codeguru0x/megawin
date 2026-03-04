"use client";

import {
  CircleDollarSign,
  FileText,
  List,
  Loader2,
  Users,
  Wallet,
  Building2,
  ChevronsUpDown,
} from "lucide-react";
import { StatCard } from "@/components/games/lotto535/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { formatVND, formatNumber } from "@megawin/shared/utils/number";
import { useOpsSummary, useOpsTenantBreakdown, type OpsQueryParams } from "./use-operations";

export function BettingOverview({ params }: { params: OpsQueryParams }) {
  return (
    <div className="space-y-4">
      <KpiCards params={params} />
      <TenantBreakdown params={params} />
    </div>
  );
}

function KpiCards({ params }: { params: OpsQueryParams }) {
  const { data, isLoading } = useOpsSummary(params);

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex h-[88px] items-center justify-center rounded-xl border bg-card"
          >
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ))}
      </div>
    );
  }

  if (!data) return null;

  const avgPerPlayer =
    data.uniquePlayers > 0 ? Math.round(data.totalRevenue / data.uniquePlayers) : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <StatCard title="Doanh thu" value={formatVND(data.totalRevenue)} icon={CircleDollarSign} />
      <StatCard title="Entries" value={formatNumber(data.totalEntries)} icon={FileText} />
      <StatCard title="Lines" value={formatNumber(data.totalLines)} icon={List} />
      <StatCard title="Người chơi" value={formatNumber(data.uniquePlayers)} icon={Users} />
      <StatCard title="Hoa hồng ĐL" value={formatVND(data.totalCommission)} icon={Wallet} />
      <StatCard title="TB/người chơi" value={formatVND(avgPerPlayer)} icon={Users} />
    </div>
  );
}

function TenantBreakdown({ params }: { params: OpsQueryParams }) {
  const { data, isLoading } = useOpsTenantBreakdown(params);

  if (isLoading) {
    return (
      <div className="flex h-20 items-center justify-center rounded-xl border bg-card">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tenants = data?.tenants ?? [];

  if (tenants.length === 0) {
    return (
      <div className="flex h-16 items-center justify-center rounded-xl border border-dashed bg-muted/20 text-xs text-muted-foreground">
        Chưa có dữ liệu cược.
      </div>
    );
  }

  const totalRevenue = tenants.reduce((s, t) => s + t.revenue, 0);

  return (
    <Collapsible defaultOpen={tenants.length <= 3}>
      <div className="rounded-lg border bg-card">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium"
          >
            <div className="flex items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" />
              Phân bố theo đại lý
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                {tenants.length}
              </span>
            </div>
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>Tenant</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Người chơi</TableHead>
                  <TableHead className="text-right">Doanh thu</TableHead>
                  <TableHead className="text-right">Hoa hồng</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((t) => {
                  const share =
                    totalRevenue > 0 ? ((t.revenue / totalRevenue) * 100).toFixed(1) : "0";
                  return (
                    <TableRow key={t.tenantId} className="text-xs">
                      <TableCell className="font-medium">{t.tenantId}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(t.entries)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(t.lines)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(t.players)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatVND(t.revenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatVND(t.commission)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {share}%
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
