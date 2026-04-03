"use client";

import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface GameDrawBreadcrumbProps {
  /** Label của nút root, VD: "Kỳ quay" */
  rootLabel: string;
  drawId?: string;
  tenantId?: string;
  /** Tên hiển thị của player (accountId hoặc username đã xử lý). */
  playerName?: string;
  onRootClick: () => void;
  /** Gọi khi click vào drawId — quay về cấp draw-tenants. */
  onDrawClick?: () => void;
  /** Gọi khi click vào tenantId — quay về cấp players. */
  onTenantClick?: () => void;
}

/**
 * Breadcrumb navigation cho tab "Theo kỳ quay" — 4 cấp drill-down.
 *
 * Levels: [root] → [drawId] → [tenantId] → [playerName]
 *
 * Level cuối cùng hiển thị dạng badge thay vì button (không thể click tiếp).
 */
export function GameDrawBreadcrumb({
  rootLabel,
  drawId,
  tenantId,
  playerName,
  onRootClick,
  onDrawClick,
  onTenantClick,
}: GameDrawBreadcrumbProps) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      <Button
        variant="ghost"
        size="sm"
        className="h-auto px-2 py-1 text-xs"
        onClick={onRootClick}
      >
        {rootLabel}
      </Button>

      {drawId && (
        <>
          <ChevronRight className="size-3 text-muted-foreground" />
          {onDrawClick ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs"
              onClick={onDrawClick}
            >
              {drawId}
            </Button>
          ) : (
            <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">{drawId}</span>
          )}
        </>
      )}

      {tenantId && (
        <>
          <ChevronRight className="size-3 text-muted-foreground" />
          {onTenantClick ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs"
              onClick={onTenantClick}
            >
              {tenantId}
            </Button>
          ) : (
            <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">
              {tenantId}
            </span>
          )}
        </>
      )}

      {playerName && (
        <>
          <ChevronRight className="size-3 text-muted-foreground" />
          <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">
            {playerName}
          </span>
        </>
      )}
    </div>
  );
}

export interface GameTenantBreadcrumbProps {
  /** Label của nút root, VD: "Đại lý" */
  rootLabel: string;
  tenantId?: string;
  /** drawId khi đang ở cấp kỳ quay trong tab Theo đại lý. */
  drawId?: string;
  /** playerName khi đang ở cấp entries. */
  playerName?: string;
  onRootClick: () => void;
  /** Gọi khi click tenantId — quay về danh sách kỳ quay của đại lý. */
  onTenantClick?: () => void;
  /** Gọi khi click drawId — quay về player list. */
  onDrawClick?: () => void;
}

/**
 * Breadcrumb navigation cho tab "Theo đại lý" — 4 cấp drill-down.
 *
 * Levels: [root] → [tenantId] → [drawId] → [playerName]
 */
export function GameTenantBreadcrumb({
  rootLabel,
  tenantId,
  drawId,
  playerName,
  onRootClick,
  onTenantClick,
  onDrawClick,
}: GameTenantBreadcrumbProps) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      <Button
        variant="ghost"
        size="sm"
        className="h-auto px-2 py-1 text-xs"
        onClick={onRootClick}
      >
        {rootLabel}
      </Button>

      {tenantId && (
        <>
          <ChevronRight className="size-3 text-muted-foreground" />
          {onTenantClick ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs"
              onClick={onTenantClick}
            >
              {tenantId}
            </Button>
          ) : (
            <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">
              {tenantId}
            </span>
          )}
        </>
      )}

      {drawId && (
        <>
          <ChevronRight className="size-3 text-muted-foreground" />
          {onDrawClick ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs"
              onClick={onDrawClick}
            >
              {drawId}
            </Button>
          ) : (
            <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">{drawId}</span>
          )}
        </>
      )}

      {playerName && (
        <>
          <ChevronRight className="size-3 text-muted-foreground" />
          <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">
            {playerName}
          </span>
        </>
      )}
    </div>
  );
}
