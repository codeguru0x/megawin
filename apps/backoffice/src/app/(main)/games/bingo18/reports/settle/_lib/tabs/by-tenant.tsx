"use client";

import { toTenantUsername } from "@megawin/shared/utils";
import {
  GameTenantReportTable,
  GameTenantDrawList,
  GamePlayerBreakdownTable,
  GameTenantBreadcrumb,
} from "@/components/reports/game/settle";
import { useBingo18ReportFilters } from "../use-report-filters";
import { useBingo18TenantList, useBingo18TenantDraws, useBingo18Players } from "../use-report-queries";
import { TableSkeleton, ErrorCard, EmptyCard } from "../sections/shared-states";
import { EntryList } from "../sections/entry-list";

// ─── Level 1: Danh sách đại lý + KPI ─────────────────────────────────────────

function TenantSummaryTable() {
  const { from, to, navigateToTenantDrills } = useBingo18ReportFilters();
  const { data, isLoading, error } = useBingo18TenantList(from, to);

  if (isLoading) return <TableSkeleton rows={6} />;
  if (error) return <ErrorCard />;
  if (!data?.length)
    return (
      <EmptyCard
        icon="building"
        message="Không có dữ liệu"
        description="Không tìm thấy dữ liệu đại lý trong khoảng thời gian đã chọn."
      />
    );

  const rows = data.map((r) => ({
    ...r,
    netProfit: r.totalStake - r.totalPayout - r.totalCommission,
  }));

  return <GameTenantReportTable rows={rows} onRowClick={navigateToTenantDrills} />;
}

// ─── Level 2: Danh sách kỳ quay của 1 đại lý ─────────────────────────────────

function TenantDrawList({ tenantId }: { tenantId: string }) {
  const { from, to, navigateToDrawInTenant } = useBingo18ReportFilters();
  const { data, isLoading, error } = useBingo18TenantDraws(tenantId, from, to);

  if (isLoading) return <TableSkeleton rows={8} />;
  if (error) return <ErrorCard />;
  if (!data?.data.length)
    return (
      <EmptyCard icon="calendar" message="Không có dữ liệu" description="Không có kỳ quay nào." />
    );

  const rows = data.data.map((r) => ({
    ...r,
    netProfit: r.totalStake - r.totalPayout - r.totalCommission,
  }));

  return (
    <GameTenantDrawList
      tenantId={tenantId}
      rows={rows}
      totalCount={data.total}
      onRowClick={navigateToDrawInTenant}
    />
  );
}

// ─── Level 3: Danh sách player trong 1 draw × 1 đại lý ───────────────────────

function PlayerBreakdown({ drawId, tenantId }: { drawId: string; tenantId: string }) {
  const { navigateToEntriesFromTenant } = useBingo18ReportFilters();
  const { data: players, isLoading } = useBingo18Players(drawId, tenantId);

  if (isLoading) return <TableSkeleton rows={5} />;
  if (!players?.length)
    return (
      <EmptyCard icon="ticket" message="Không có dữ liệu" description="Không có player nào." />
    );

  const rows = players.map((p) => ({
    accountId: p.accountId,
    displayName: toTenantUsername(p.username) ?? p.accountId,
    entryCount: p.entryCount,
    totalStake: p.totalStake ?? 0,
    totalWin: p.totalWin ?? 0,
    totalPayout: p.totalPayout ?? 0,
  }));

  return (
    <GamePlayerBreakdownTable
      drawId={drawId}
      tenantId={tenantId}
      rows={rows}
      onRowClick={(accountId, displayName) => navigateToEntriesFromTenant(accountId, displayName)}
    />
  );
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function Breadcrumb() {
  const {
    level,
    drawId,
    tenantId,
    accountId,
    playerName,
    navigateToList,
    navigateBackToTenantDraws,
    setLevel,
  } = useBingo18ReportFilters();

  return (
    <GameTenantBreadcrumb
      rootLabel="Đại lý"
      tenantId={tenantId ?? undefined}
      drawId={level === "draw-tenants" || level === "entries" ? (drawId ?? undefined) : undefined}
      playerName={
        level === "entries" && accountId
          ? (playerName ?? toTenantUsername(accountId) ?? accountId)
          : undefined
      }
      onRootClick={navigateToList}
      onTenantClick={tenantId ? () => navigateBackToTenantDraws() : undefined}
      onDrawClick={drawId && level === "entries" ? () => void setLevel("draw-tenants") : undefined}
    />
  );
}

// ─── ByTenantTab ──────────────────────────────────────────────────────────────

export function ByTenantTab() {
  const { level, tenantId, drawId, accountId, playerName } = useBingo18ReportFilters();
  const playerDisplayName = playerName ?? undefined;

  return (
    <div className="flex flex-col gap-4">
      {level !== "list" && <Breadcrumb />}
      {level === "list" && <TenantSummaryTable />}
      {level === "tenant-draws" && tenantId && <TenantDrawList tenantId={tenantId} />}
      {level === "draw-tenants" && drawId && tenantId && (
        <PlayerBreakdown drawId={drawId} tenantId={tenantId} />
      )}
      {level === "entries" && drawId && tenantId && accountId && (
        <EntryList
          drawId={drawId}
          tenantId={tenantId}
          accountId={accountId}
          playerDisplayName={playerDisplayName}
        />
      )}
    </div>
  );
}
