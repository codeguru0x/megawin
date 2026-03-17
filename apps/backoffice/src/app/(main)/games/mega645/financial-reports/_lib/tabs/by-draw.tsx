"use client";

import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMega645ReportFilters } from "../use-report-filters";
import { KpiStrip } from "../sections/kpi-strip";
import { DrawList } from "../sections/draw-list";
import { DrawTenantBreakdown } from "../sections/draw-tenant-breakdown";
import { PlayerBreakdown } from "../sections/player-breakdown";
import { EntryList } from "../sections/entry-list";

function Breadcrumb() {
  const {
    level,
    drawId,
    tenantId,
    playerId,
    playerName,
    navigateToList,
    navigateToDraw,
    navigateToTenantInDraw,
  } = useMega645ReportFilters();

  return (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      <Button
        variant="ghost"
        size="sm"
        className="h-auto px-2 py-1 text-xs"
        onClick={navigateToList}
      >
        Kỳ quay
      </Button>
      {drawId && (
        <>
          <ChevronRight className="size-3 text-muted-foreground" />
          <Button
            variant={level === "draw-tenants" ? "secondary" : "ghost"}
            size="sm"
            className="h-auto px-2 py-1 text-xs"
            onClick={() => navigateToDraw(drawId)}
          >
            {drawId}
          </Button>
        </>
      )}
      {tenantId && drawId && (
        <>
          <ChevronRight className="size-3 text-muted-foreground" />
          <Button
            variant={level === "players" ? "secondary" : "ghost"}
            size="sm"
            className="h-auto px-2 py-1 text-xs"
            onClick={() => navigateToTenantInDraw(tenantId)}
          >
            {tenantId}
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

/** Tab "Theo kỳ quay" — 4 cấp drill-down. */
export function ByDrawTab() {
  const { from, to, level, drawId, tenantId, playerId, playerName } = useMega645ReportFilters();

  return (
    <div className="flex flex-col gap-4">
      {level !== "list" && <Breadcrumb />}
      {level === "list" && <KpiStrip from={from} to={to} />}
      {level === "list" && <DrawList />}
      {level === "draw-tenants" && drawId && <DrawTenantBreakdown drawId={drawId} />}
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
