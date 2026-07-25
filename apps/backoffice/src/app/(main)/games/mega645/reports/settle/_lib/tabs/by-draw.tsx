"use client";

import { Pagination } from "@megawin/shared/constants/pagination";
import { toTenantUsername } from "@megawin/shared/utils";

import {
  GameDrawBreadcrumb,
  GameDrawKpiStrip,
  GameDrawKpiStripSkeleton,
  GameDrawReportTable,
  GameDrawTenantTable,
  GamePlayerBreakdownTable,
} from "@/components/reports/game/settle";

import { EntryList } from "../sections/entry-list";
import { EmptyCard, ErrorCard, TableSkeleton } from "../sections/shared-states";
import { useMega645ReportFilters } from "../use-report-filters";
import {
  useMega645DrawList,
  useMega645DrawSummary,
  useMega645DrawTenants,
  useMega645Players,
} from "../use-report-queries";

const LIMIT = Pagination.Default.Size;

function DrawList() {
  const { from, to, page, setPage, navigateToDraw } = useMega645ReportFilters();
  const { data: summary } = useMega645DrawSummary(from, to);
  const { data, isLoading, error } = useMega645DrawList(from, to, page);
  const totalPages = data ? Math.ceil(data.total / LIMIT) : 1;

  if (isLoading)
    return (
      <div className="space-y-4">
        <GameDrawKpiStripSkeleton />
        <TableSkeleton />
      </div>
    );
  if (error) return <ErrorCard />;
  if (!data?.data.length)
    return (
      <EmptyCard
        icon="calendar"
        message="Không có dữ liệu"
        description="Không tìm thấy kỳ quay nào trong khoảng thời gian đã chọn."
      />
    );

  return (
    <div className="space-y-4">
      {summary && <GameDrawKpiStrip data={summary} />}
      <GameDrawReportTable
        rows={data.data}
        onRowClick={navigateToDraw}
        totalCount={data.total}
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => void setPage(p)}
        showLineCount
      />
    </div>
  );
}

function DrawTenantBreakdown({ drawId }: { drawId: string }) {
  const { navigateToPlayersInDraw } = useMega645ReportFilters();
  const { data, isLoading } = useMega645DrawTenants(drawId);

  if (isLoading) return <TableSkeleton rows={6} />;
  if (!data?.length)
    return (
      <EmptyCard icon="building" message="Không có dữ liệu" description="Không có đại lý nào tham gia kỳ quay này." />
    );

  return <GameDrawTenantTable drawId={drawId} rows={data} onRowClick={navigateToPlayersInDraw} showLineCount />;
}

function PlayerBreakdown({ drawId, tenantId }: { drawId: string; tenantId: string }) {
  const { navigateToEntries } = useMega645ReportFilters();
  const { data: players, isLoading } = useMega645Players(drawId, tenantId);

  if (isLoading) return <TableSkeleton rows={5} />;
  if (!players?.length)
    return <EmptyCard icon="ticket" message="Không có dữ liệu" description="Không có player nào." />;

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
    <GamePlayerBreakdownTable
      drawId={drawId}
      tenantId={tenantId}
      rows={rows}
      onRowClick={(accountId, displayName) => navigateToEntries(accountId, displayName)}
      showLineCount
    />
  );
}

function Breadcrumb() {
  const { level, drawId, tenantId, accountId, playerName, navigateToList, navigateToDraw, navigateBackToPlayers } =
    useMega645ReportFilters();

  return (
    <GameDrawBreadcrumb
      rootLabel="Kỳ quay"
      drawId={drawId ?? undefined}
      tenantId={level === "players" || level === "entries" ? (tenantId ?? undefined) : undefined}
      playerName={
        level === "entries" && accountId ? (playerName ?? toTenantUsername(accountId) ?? accountId) : undefined
      }
      onRootClick={navigateToList}
      onDrawClick={drawId && (level === "players" || level === "entries") ? () => navigateToDraw(drawId) : undefined}
      onTenantClick={tenantId && level === "entries" ? () => navigateBackToPlayers() : undefined}
    />
  );
}

export function ByDrawTab() {
  const { level, drawId, tenantId, accountId, playerName } = useMega645ReportFilters();
  const playerDisplayName = playerName ?? undefined;
  return (
    <div className="flex flex-col gap-4">
      {level !== "list" && <Breadcrumb />}
      {level === "list" && <DrawList />}
      {level === "draw-tenants" && drawId && <DrawTenantBreakdown drawId={drawId} />}
      {level === "players" && drawId && tenantId && <PlayerBreakdown drawId={drawId} tenantId={tenantId} />}
      {level === "entries" && drawId && tenantId && accountId && (
        <EntryList drawId={drawId} tenantId={tenantId} accountId={accountId} playerDisplayName={playerDisplayName} />
      )}
    </div>
  );
}
