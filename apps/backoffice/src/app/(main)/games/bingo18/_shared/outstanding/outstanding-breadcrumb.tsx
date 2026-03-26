"use client";

import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBingo18OutstandingFilters } from "./use-outstanding-filters";
import type { OutstandingDrillLevel } from "./use-outstanding-filters";

interface OutstandingBreadcrumbProps {
  level: OutstandingDrillLevel;
  drawId: string | null;
  tenantId: string | null;
  playerId: string | null;
  /** Username hiển thị thay accountId — lấy từ URL state. */
  playerName: string | null;
}

/**
 * Breadcrumb navigation cho Bingo 18 Outstanding drill-down view.
 *
 * Hiển thị username thay accountId ở Level 4 nếu có.
 */
export function OutstandingBreadcrumb({
  level,
  drawId,
  tenantId,
  playerId,
  playerName,
}: OutstandingBreadcrumbProps) {
  const { navigateToList, navigateToDraw, navigateToTenant } = useBingo18OutstandingFilters();

  if (level === "list") return null;

  const playerLabel = playerName || playerId;

  return (
    <div className="flex items-center gap-1 text-sm">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-muted-foreground hover:text-foreground"
        onClick={navigateToList}
      >
        Outstanding
      </Button>

      {drawId && (
        <>
          <ChevronRight className="size-3 text-muted-foreground" />
          {level === "draw-tenants" ? (
            <span className="rounded-md bg-secondary px-2 py-1 text-xs font-mono font-medium">
              {drawId}
            </span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 font-mono text-muted-foreground hover:text-foreground"
              onClick={() => navigateToDraw(drawId)}
            >
              {drawId}
            </Button>
          )}
        </>
      )}

      {tenantId && (
        <>
          <ChevronRight className="size-3 text-muted-foreground" />
          {level === "players" ? (
            <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">
              {tenantId}
            </span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground hover:text-foreground"
              onClick={() => navigateToTenant(tenantId)}
            >
              {tenantId}
            </Button>
          )}
        </>
      )}

      {playerLabel && level === "entries" && (
        <>
          <ChevronRight className="size-3 text-muted-foreground" />
          <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">
            {playerLabel}
          </span>
        </>
      )}
    </div>
  );
}
