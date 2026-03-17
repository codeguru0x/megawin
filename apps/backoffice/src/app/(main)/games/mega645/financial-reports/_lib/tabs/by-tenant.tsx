"use client";

import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMega645ReportFilters } from "../use-report-filters";
import { TenantSummaryTable } from "../sections/tenant-summary-table";
import { TenantDrawList } from "../sections/tenant-draw-list";
import { PlayerBreakdown } from "../sections/player-breakdown";
import { EntryList } from "../sections/entry-list";

function Breadcrumb() {
  const {
    level,
    tenantId,
    drawId,
    playerId,
    playerName,
    navigateToList,
    navigateToTenantDrills,
    navigateToDrawInTenant,
  } = useMega645ReportFilters();

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
          <Button
            variant={level === "tenant-draws" ? "secondary" : "ghost"}
            size="sm"
            className="h-auto px-2 py-1 text-xs"
            onClick={() => navigateToTenantDrills(tenantId)}
          >
            {tenantId}
          </Button>
        </>
      )}
      {drawId && tenantId && (
        <>
          <ChevronRight className="size-3 text-muted-foreground" />
          <Button
            variant={level === "players" ? "secondary" : "ghost"}
            size="sm"
            className="h-auto px-2 py-1 text-xs"
            onClick={() => navigateToDrawInTenant(drawId, tenantId)}
          >
            {drawId}
          </Button>
        </>
      )}
      {playerId && (
        <>
          <ChevronRight className="size-3 text-muted-foreground" />
          <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">
            {playerName || playerId}
          </span>
        </>
      )}
    </div>
  );
}

/**
 * Tab "Theo đại lý" — drill-down:
 * list → tenant-draws → players → entries
 *
 * Giữ nguyên tab "tenants" xuyên suốt, KHÔNG chuyển sang tab "draws".
 */
export function ByTenantTab() {
  const { level, tenantId, drawId, playerId, playerName } = useMega645ReportFilters();

  return (
    <div className="flex flex-col gap-4">
      {level !== "list" && <Breadcrumb />}
      {level === "list" && <TenantSummaryTable />}
      {level === "tenant-draws" && tenantId && <TenantDrawList tenantId={tenantId} />}
      {level === "players" && drawId && tenantId && (
        <PlayerBreakdown drawId={drawId} tenantId={tenantId} />
      )}
      {level === "entries" && drawId && tenantId && playerId && (
        <EntryList
          drawId={drawId}
          tenantId={tenantId}
          accountId={playerId}
          playerDisplayName={playerName ?? undefined}
        />
      )}
    </div>
  );
}
