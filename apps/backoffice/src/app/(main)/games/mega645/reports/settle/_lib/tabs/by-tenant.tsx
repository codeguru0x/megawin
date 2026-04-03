"use client";

import { toTenantUsername } from "@megawin/shared/utils";
import {
  GameTenantReportTable,
  GameTenantDrawList,
  GamePlayerBreakdownTable,
  GameTenantBreadcrumb,
} from "@/components/reports/game/settle";
import { useMega645ReportFilters } from "../use-report-filters";
import { useMega645TenantList, useMega645TenantDraws, useMega645Players } from "../use-report-queries";
import { TableSkeleton, ErrorCard, EmptyCard } from "../sections/shared-states";
import { EntryList } from "../sections/entry-list";

function TenantSummaryTable() {
  const { from, to, navigateToTenantDrills } = useMega645ReportFilters();
  const { data, isLoading, error } = useMega645TenantList(from, to);

  if (isLoading) return <TableSkeleton rows={6} />;
  if (error) return <ErrorCard />;
  if (!data?.length)
    return (<EmptyCard icon="building" message="Không có dữ liệu" description="Không tìm thấy dữ liệu đại lý." />);

  const rows = data.map((r) => ({ ...r, netProfit: r.totalStake - r.totalPayout - r.totalCommission }));
  return <GameTenantReportTable rows={rows} onRowClick={navigateToTenantDrills} showLineCount />;
}

function TenantDrawList({ tenantId }: { tenantId: string }) {
  const { from, to, navigateToDrawInTenant } = useMega645ReportFilters();
  const { data, isLoading, error } = useMega645TenantDraws(tenantId, from, to);

  if (isLoading) return <TableSkeleton rows={8} />;
  if (error) return <ErrorCard />;
  if (!data?.data.length)
    return (<EmptyCard icon="calendar" message="Không có dữ liệu" description="Không có kỳ quay nào." />);

  const rows = data.data.map((r) => ({ ...r, netProfit: r.totalStake - r.totalPayout - r.totalCommission }));
  return <GameTenantDrawList tenantId={tenantId} rows={rows} totalCount={data.total} onRowClick={navigateToDrawInTenant} showLineCount />;
}

function PlayerBreakdown({ drawId, tenantId }: { drawId: string; tenantId: string }) {
  const { navigateToEntriesFromTenant } = useMega645ReportFilters();
  const { data: players, isLoading } = useMega645Players(drawId, tenantId);

  if (isLoading) return <TableSkeleton rows={5} />;
  if (!players?.length)
    return (<EmptyCard icon="ticket" message="Không có dữ liệu" description="Không có player nào." />);

  const rows = players.map((p) => ({
    accountId: p.accountId,
    displayName: toTenantUsername(p.username) ?? p.accountId,
    entryCount: p.entryCount,
    lineCount: p.lineCount ?? 0,
    totalStake: p.totalStake ?? 0,
    totalWin: p.totalWin ?? 0,
    totalPayout: p.totalPayout ?? 0,
  }));

  return (
    <GamePlayerBreakdownTable drawId={drawId} tenantId={tenantId} rows={rows}
      onRowClick={(accountId, displayName) => navigateToEntriesFromTenant(accountId, displayName)}
      showLineCount />
  );
}

function Breadcrumb() {
  const { level, drawId, tenantId, accountId, playerName, navigateToList, navigateBackToTenantDraws, setLevel } = useMega645ReportFilters();

  return (
    <GameTenantBreadcrumb
      rootLabel="Đại lý"
      tenantId={tenantId ?? undefined}
      drawId={level === "draw-tenants" || level === "entries" ? (drawId ?? undefined) : undefined}
      playerName={level === "entries" && accountId ? (playerName ?? toTenantUsername(accountId) ?? accountId) : undefined}
      onRootClick={navigateToList}
      onTenantClick={tenantId ? () => navigateBackToTenantDraws() : undefined}
      onDrawClick={drawId && level === "entries" ? () => void setLevel("draw-tenants") : undefined}
    />
  );
}

export function ByTenantTab() {
  const { level, tenantId, drawId, accountId, playerName } = useMega645ReportFilters();
  const playerDisplayName = playerName ?? undefined;

  return (
    <div className="flex flex-col gap-4">
      {level !== "list" && <Breadcrumb />}
      {level === "list" && <TenantSummaryTable />}
      {level === "tenant-draws" && tenantId && <TenantDrawList tenantId={tenantId} />}
      {level === "draw-tenants" && drawId && tenantId && <PlayerBreakdown drawId={drawId} tenantId={tenantId} />}
      {level === "entries" && drawId && tenantId && accountId && (
        <EntryList drawId={drawId} tenantId={tenantId} accountId={accountId} playerDisplayName={playerDisplayName} />
      )}
    </div>
  );
}
