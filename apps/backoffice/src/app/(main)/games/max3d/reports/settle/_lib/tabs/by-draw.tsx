"use client";

import { toTenantUsername } from "@megawin/shared/utils";
import {
  GameDrawKpiStrip,
  GameDrawKpiStripSkeleton,
  GameDrawReportTable,
  GameDrawTenantTable,
  GamePlayerBreakdownTable,
  GameDrawBreadcrumb,
} from "@/components/reports/game/settle";
import { Pagination } from "@megawin/shared/constants/pagination";
import { useMax3dReportFilters } from "../use-report-filters";
import { EntryList } from "../sections/entry-list";
import {
  useMax3DDrawSummary,
  useMax3DDrawList,
  useMax3DDrawTenants,
  useMax3DPlayers,
} from "../use-report-queries";
import { TableSkeleton, ErrorCard, EmptyCard } from "../sections/shared-states";

const LIMIT = Pagination.Default.Size;

// ─── Draw List ────────────────────────────────────────────────────────────────

function DrawList() {
  const { from, to, page, setPage, navigateToDraw } = useMax3dReportFilters();
  const { data: summary } = useMax3DDrawSummary(from, to);
  const { data, isLoading, error } = useMax3DDrawList(from, to, page);
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
        description="Không tìm thấy kỳ quay nào trong khoảng thời gian đã chọn. Thử mở rộng khoảng ngày."
      />
    );

  return (
    <div className="space-y-4">
      {summary && <GameDrawKpiStrip data={summary} drawCountSub="kỳ đã settle · T2, T4, T6" />}
      <GameDrawReportTable
        rows={data.data}
        onRowClick={navigateToDraw}
        showLineCount
        totalCount={data.total}
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => void setPage(p)}
        drawFrequencyLabel="T2, T4, T6"
      />
    </div>
  );
}

// ─── Draw Tenant Breakdown ────────────────────────────────────────────────────

function DrawTenantBreakdown({ drawId }: { drawId: string }) {
  const { navigateToPlayersInDraw } = useMax3dReportFilters();
  const { data, isLoading } = useMax3DDrawTenants(drawId);

  if (isLoading) return <TableSkeleton rows={6} />;
  if (!data?.length)
    return (
      <EmptyCard
        icon="building"
        message="Không có dữ liệu"
        description="Không có đại lý nào tham gia kỳ quay này."
      />
    );

  return (
    <GameDrawTenantTable
      drawId={drawId}
      rows={data}
      onRowClick={navigateToPlayersInDraw}
      showLineCount
    />
  );
}

// ─── Player Breakdown ─────────────────────────────────────────────────────────

function PlayerBreakdown({ drawId, tenantId }: { drawId: string; tenantId: string }) {
  const { navigateToEntries } = useMax3dReportFilters();
  const { data: players, isLoading } = useMax3DPlayers(drawId, tenantId);

  if (isLoading) return <TableSkeleton rows={5} />;
  if (!players?.length)
    return (
      <EmptyCard icon="ticket" message="Không có dữ liệu" description="Không có player nào." />
    );

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
      onRowClick={(accountId, displayName) => navigateToEntries(accountId, displayName)}
      showLineCount
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
    navigateToDraw,
    navigateBackToPlayers,
  } = useMax3dReportFilters();

  return (
    <GameDrawBreadcrumb
      rootLabel="Kỳ quay"
      drawId={drawId ?? undefined}
      tenantId={level === "players" || level === "entries" ? (tenantId ?? undefined) : undefined}
      playerName={
        level === "entries" && accountId
          ? (playerName ?? toTenantUsername(accountId) ?? accountId)
          : undefined
      }
      onRootClick={navigateToList}
      onDrawClick={
        drawId && (level === "players" || level === "entries")
          ? () => navigateToDraw(drawId)
          : undefined
      }
      onTenantClick={tenantId && level === "entries" ? () => navigateBackToPlayers() : undefined}
    />
  );
}

// ─── ByDrawTab ────────────────────────────────────────────────────────────────

export function ByDrawTab() {
  const { level, drawId, tenantId, accountId, playerName } = useMax3dReportFilters();
  const playerDisplayName = playerName ?? undefined;
  return (
    <div className="flex flex-col gap-4">
      {level !== "list" && <Breadcrumb />}

      {/* Level 1 — Danh sách kỳ quay */}
      {level === "list" && <DrawList />}

      {/* Level 2 — Đại lý theo kỳ quay (chỉ có drawId, chưa có tenantId) */}
      {level === "draw-tenants" && drawId && <DrawTenantBreakdown drawId={drawId} />}

      {/* Level 3 — Player list (có drawId + tenantId) */}
      {level === "players" && drawId && tenantId && (
        <PlayerBreakdown drawId={drawId} tenantId={tenantId} />
      )}

      {/* Level 4 — Entries của 1 player (có drawId + tenantId + accountId) */}
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
