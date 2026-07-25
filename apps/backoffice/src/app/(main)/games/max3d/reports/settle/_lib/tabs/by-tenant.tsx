"use client";

import { toTenantUsername } from "@megawin/shared/utils";

import {
  GamePlayerBreakdownTable,
  GameTenantBreadcrumb,
  GameTenantDrawList,
  GameTenantReportTable,
} from "@/components/reports/game/settle";

import { EntryList } from "../sections/entry-list";
import { EmptyCard, ErrorCard, TableSkeleton } from "../sections/shared-states";
import { useMax3dReportFilters } from "../use-report-filters";
import { useMax3DPlayers, useMax3DTenantDraws, useMax3DTenantList } from "../use-report-queries";

// ─── Level 1: Danh sách đại lý + KPI ─────────────────────────────────────────

function TenantSummaryTable() {
  const { from, to, navigateToTenantDrills } = useMax3dReportFilters();
  const { data, isLoading, error } = useMax3DTenantList(from, to);

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

  return <GameTenantReportTable rows={rows} onRowClick={navigateToTenantDrills} showLineCount />;
}

// ─── Level 2: Danh sách kỳ quay của 1 đại lý ─────────────────────────────────

function TenantDrawList({ tenantId }: { tenantId: string }) {
  const { from, to, navigateToDrawInTenant } = useMax3dReportFilters();
  const { data, isLoading, error } = useMax3DTenantDraws(tenantId, from, to);

  if (isLoading) return <TableSkeleton rows={8} />;
  if (error) return <ErrorCard />;
  if (!data?.data.length)
    return <EmptyCard icon="calendar" message="Không có dữ liệu" description="Không có kỳ quay nào." />;

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
      showLineCount
    />
  );
}

// ─── Level 3: Danh sách player trong 1 draw × 1 đại lý ───────────────────────

function PlayerBreakdown({ drawId, tenantId }: { drawId: string; tenantId: string }) {
  const { navigateToEntriesFromTenant } = useMax3dReportFilters();
  const { data: players, isLoading } = useMax3DPlayers(drawId, tenantId);

  if (isLoading) return <TableSkeleton rows={5} />;
  if (!players?.length)
    return <EmptyCard icon="ticket" message="Không có dữ liệu" description="Không có player nào." />;

  const rows = players.map((p) => ({
    accountId: p.accountId,
    displayName: toTenantUsername(p.username) ?? p.accountId,
    entryCount: p.entryCount,
    lineCount: p.lineCount,
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
      showLineCount
    />
  );
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

function Breadcrumb() {
  const { level, drawId, tenantId, accountId, playerName, navigateToList, navigateBackToTenantDraws, setLevel } =
    useMax3dReportFilters();

  return (
    <GameTenantBreadcrumb
      rootLabel="Đại lý"
      tenantId={tenantId ?? undefined}
      drawId={level === "draw-tenants" || level === "entries" ? (drawId ?? undefined) : undefined}
      playerName={
        level === "entries" && accountId ? (playerName ?? toTenantUsername(accountId) ?? accountId) : undefined
      }
      onRootClick={navigateToList}
      onTenantClick={tenantId ? () => navigateBackToTenantDraws() : undefined}
      onDrawClick={drawId && level === "entries" ? () => void setLevel("draw-tenants") : undefined}
    />
  );
}

// ─── ByTenantTab ──────────────────────────────────────────────────────────────

export function ByTenantTab() {
  const { level, tenantId, drawId, accountId, playerName } = useMax3dReportFilters();
  const playerDisplayName = playerName ?? undefined;

  return (
    <div className="flex flex-col gap-4">
      {level !== "list" && <Breadcrumb />}

      {/* Level 1 — Danh sách đại lý */}
      {level === "list" && <TenantSummaryTable />}

      {/* Level 2 — Kỳ quay của 1 đại lý */}
      {level === "tenant-draws" && tenantId && <TenantDrawList tenantId={tenantId} />}

      {/* Level 3 — Player list: drill từ kỳ quay trong tab đại lý */}
      {level === "draw-tenants" && drawId && tenantId && <PlayerBreakdown drawId={drawId} tenantId={tenantId} />}

      {/* Level 4 — Entries của 1 player */}
      {level === "entries" && drawId && tenantId && accountId && (
        <EntryList drawId={drawId} tenantId={tenantId} accountId={accountId} playerDisplayName={playerDisplayName} />
      )}
    </div>
  );
}
