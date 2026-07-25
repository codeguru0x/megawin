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
  if (level === "list") return null;

  const playerLabel = playerName || playerId;

  return (
    <div className="flex items-center gap-1 text-sm">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-muted-foreground hover:text-foreground"
        onClick={onNavigateToList}
      >
        Outstanding
      </Button>

      {drawId && (
        <>
          <ChevronRight className="size-3 text-muted-foreground" />
          {level === "draw-tenants" ? (
            <span className="rounded-md bg-secondary px-2 py-1 text-xs font-mono font-medium">{drawId}</span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 font-mono text-muted-foreground hover:text-foreground"
              onClick={() => onNavigateToDraw(drawId)}
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
            <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">{tenantId}</span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground hover:text-foreground"
              onClick={() => onNavigateToTenant(tenantId)}
            >
              {tenantId}
            </Button>
          )}
        </>
      )}

      {playerLabel && level === "entries" && (
        <>
          <ChevronRight className="size-3 text-muted-foreground" />
          <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">{playerLabel}</span>
        </>
      )}
    </div>
  );
}
