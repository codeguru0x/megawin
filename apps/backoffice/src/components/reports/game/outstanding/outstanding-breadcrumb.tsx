"use client";

import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { OutstandingDrillLevel } from "./types";

export interface OutstandingBreadcrumbProps {
  level: OutstandingDrillLevel;
  drawId: string | null;
  tenantId: string | null;
  playerId: string | null;
  /** Display name sau toTenantUsername — hiển thị thay accountId ở Level 4. */
  playerName: string | null;
  onNavigateToList: () => void;
  onNavigateToDraw: (drawId: string) => void;
  onNavigateToTenant: (tenantId: string) => void;
}

/**
 * Breadcrumb navigation dùng chung cho Outstanding drill-down của mọi game.
 *
 * Nhận navigation callbacks từ ngoài — không tự gọi hook game-specific.
 */
export function OutstandingBreadcrumb({
  level,
  drawId,
  tenantId,
  playerId,
  playerName,
  onNavigateToList,
  onNavigateToDraw,
  onNavigateToTenant,
}: OutstandingBreadcrumbProps) {
  if (level === "list") {
    return null;
  }

  const playerLabel = playerName || playerId;

  return (
    <div className="flex items-center gap-1 text-sm">
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-foreground h-7 px-2"
        onClick={onNavigateToList}
      >
        Outstanding
      </Button>

      {drawId && (
        <>
          <ChevronRight className="text-muted-foreground size-3" />
          {level === "draw-tenants" ? (
            <span className="bg-secondary rounded-md px-2 py-1 font-mono text-xs font-medium">{drawId}</span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-7 px-2 font-mono"
              onClick={() => onNavigateToDraw(drawId)}
            >
              {drawId}
            </Button>
          )}
        </>
      )}

      {tenantId && (
        <>
          <ChevronRight className="text-muted-foreground size-3" />
          {level === "players" ? (
            <span className="bg-secondary rounded-md px-2 py-1 text-xs font-medium">{tenantId}</span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-7 px-2"
              onClick={() => onNavigateToTenant(tenantId)}
            >
              {tenantId}
            </Button>
          )}
        </>
      )}

      {playerLabel && level === "entries" && (
        <>
          <ChevronRight className="text-muted-foreground size-3" />
          <span className="bg-secondary rounded-md px-2 py-1 text-xs font-medium">{playerLabel}</span>
        </>
      )}
    </div>
  );
}
