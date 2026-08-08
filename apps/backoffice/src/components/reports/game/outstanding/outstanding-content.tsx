"use client";

import { Clock, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { OutstandingBreadcrumb } from "./outstanding-breadcrumb";
import { OutstandingDrawList } from "./outstanding-draw-list";
import { OutstandingEntryList } from "./outstanding-entry-list";
import { OutstandingKpiStrip } from "./outstanding-kpi-strip";
import { OutstandingPlayerBreakdown } from "./outstanding-player-breakdown";
import { OutstandingTenantBreakdown } from "./outstanding-tenant-breakdown";
import type {
  OutstandingDrawRow,
  OutstandingDrillLevel,
  OutstandingEntryRow,
  OutstandingKpiData,
  OutstandingPlayerRow,
  OutstandingTenantRow,
} from "./types";

// ─── Sub-types cho async data ─────────────────────────────────────────────────

interface AsyncData<T> {
  data: T[] | undefined;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

/** Callbacks điều hướng drill-down. */
interface OutstandingNavigationCallbacks {
  navigateToList: () => void;
  navigateToDraw: (drawId: string) => void;
  navigateToTenant: (tenantId: string) => void;
  navigateToPlayer: (accountId: string, displayName?: string) => void;
}

export interface OutstandingContentProps {
  /** Game name hiển thị trong page header. VD: "Mega 6/45". */
  gameName: string;
  /** Màu gradient cho icon header. VD: GAME_COLORS[GameProduct.Mega645].iconGradient. */
  iconGradient: string;

  /** URL state drill-down. */
  drawId: string | null;
  tenantId: string | null;
  playerId: string | null;
  playerName: string | null;
  level: OutstandingDrillLevel;

  /** Navigation callbacks. */
  navigation: OutstandingNavigationCallbacks;

  /** Level 1 data — danh sách kỳ quay outstanding. */
  drawsData: AsyncData<OutstandingDrawRow>;

  /** Level 2 data — tenant breakdown cho drawId đang drill. */
  tenantData: AsyncData<OutstandingTenantRow>;

  /** Level 3 data — player breakdown cho draw + tenant đang drill. */
  playerData: AsyncData<OutstandingPlayerRow>;

  /** Level 4 data — entry list cho player đang drill. */
  entryData: AsyncData<OutstandingEntryRow>;

  /** Gọi khi click entry ở Level 4 — mở dialog chi tiết. */
  onEntryClick: (entry: OutstandingEntryRow) => void;

  /**
   * Game có cột "Bộ số / Dòng cược" không.
   * Lotto535, Mega645, Power655, Max3D, Max3DPro = true.
   * Keno, Bingo18 = false.
   */
  showLineCount?: boolean;

  /** Label cho cột dòng cược. Default: "Dòng cược". Max3D/Pro dùng "Bộ số". */
  lineCountLabel?: string;
}

// ─── Live Dot ─────────────────────────────────────────────────────────────────

/**
 * Animated dot báo hiệu live data — click để force refresh.
 */
function LiveDot({ isFetching, onRefresh }: { isFetching: boolean; onRefresh: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onRefresh}
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-muted/60 transition-colors"
          aria-label="Lấy dữ liệu mới nhất"
        >
          <span className="relative flex size-2">
            {isFetching ? (
              <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
            ) : (
              <>
                {/* Ping animation — live indicator */}
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </>
            )}
          </span>
          <span className="text-xs text-muted-foreground">Live</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        Tự động refresh mỗi 60s · Nhấn để lấy dữ liệu mới nhất
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function OutstandingSkeleton({ showLineCount }: { showLineCount?: boolean }) {
  const cols = showLineCount ? 5 : 4;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-xl" />
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-3.5 w-72" />
        </div>
      </div>
      <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3", cols === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
        {[...Array(cols)].map((_, i) => (
          <Skeleton key={i} className="h-18 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Outstanding content orchestrator dùng chung cho mọi game.
 *
 * Render đúng level component dựa trên URL state.
 * KpiStrip chỉ hiển thị ở Level 1.
 * Breadcrumb hiển thị từ Level 2 trở lên.
 *
 * Game-specific logic (hooks, dialog) nằm ở game wrapper bên ngoài.
 */
export function OutstandingContent({
  gameName,
  iconGradient,
  drawId,
  tenantId,
  playerId,
  playerName,
  level,
  navigation,
  drawsData,
  tenantData,
  playerData,
  entryData,
  onEntryClick,
  showLineCount = false,
  lineCountLabel,
}: OutstandingContentProps) {
  const { navigateToList, navigateToDraw, navigateToTenant, navigateToPlayer } = navigation;

  if (drawsData.isLoading) {
    return <OutstandingSkeleton showLineCount={showLineCount} />;
  }

  const allRows = drawsData.data ?? [];

  const kpiData: OutstandingKpiData = {
    activeDrawCount: allRows.length,
    totalEntries: allRows.reduce((s, r) => s + r.entryCount, 0),
    totalLines: showLineCount ? allRows.reduce((s, r) => s + (r.lineCount ?? 0), 0) : undefined,
    totalCommission: allRows.reduce((s, r) => s + r.estimatedCommission, 0),
    totalStake: allRows.reduce((s, r) => s + r.totalStake, 0),
  };

  return (
    <div className="flex flex-col gap-4">
      {/* PageHeader */}
      <div className="flex items-center gap-3">
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${iconGradient} shadow-sm`}
        >
          <Clock className="size-4.5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{gameName} — Outstanding</h1>
          <div className="flex items-center gap-1.5">
            <p className="text-xs text-muted-foreground">Entries chưa settle</p>
            <LiveDot isFetching={drawsData.isLoading} onRefresh={() => drawsData.refetch()} />
          </div>
        </div>
      </div>

      {/* KPI Strip — chỉ Level 1 */}
      {level === "list" && (
        <OutstandingKpiStrip data={kpiData} showLineCount={showLineCount} lineCountLabel={lineCountLabel} />
      )}

      {/* Breadcrumb — từ Level 2 trở lên */}
      {level !== "list" && (
        <OutstandingBreadcrumb
          level={level}
          drawId={drawId}
          tenantId={tenantId}
          playerId={playerId}
          playerName={playerName}
          onNavigateToList={navigateToList}
          onNavigateToDraw={navigateToDraw}
          onNavigateToTenant={navigateToTenant}
        />
      )}

      {/* Error state — chỉ Level 1 */}
      {!!drawsData.error && (
        <Card className="gap-0 py-0">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">Lỗi tải dữ liệu. Vui lòng thử lại.</p>
            <Button variant="outline" size="sm" onClick={() => drawsData.refetch()}>
              <RefreshCw className="mr-2 size-4" />
              Thử lại
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Level 1 — Draw List */}
      {!drawsData.error && level === "list" && (
        <OutstandingDrawList
          data={allRows}
          onRowClick={navigateToDraw}
          showLineCount={showLineCount}
          lineCountLabel={lineCountLabel}
        />
      )}

      {/* Level 2 — Tenant Breakdown */}
      {level === "draw-tenants" && drawId && (
        <OutstandingTenantBreakdown
          drawId={drawId}
          rows={tenantData.data ?? []}
          isLoading={tenantData.isLoading}
          error={tenantData.error}
          onRefetch={tenantData.refetch}
          onRowClick={navigateToTenant}
          showLineCount={showLineCount}
          lineCountLabel={lineCountLabel}
        />
      )}

      {/* Level 3 — Player Breakdown */}
      {level === "players" && drawId && tenantId && (
        <OutstandingPlayerBreakdown
          drawId={drawId}
          tenantId={tenantId}
          rows={playerData.data ?? []}
          isLoading={playerData.isLoading}
          error={playerData.error}
          onRefetch={playerData.refetch}
          onRowClick={navigateToPlayer}
          showLineCount={showLineCount}
          lineCountLabel={lineCountLabel}
        />
      )}

      {/* Level 4 — Entry List */}
      {level === "entries" && drawId && tenantId && playerId && (
        <OutstandingEntryList
          drawId={drawId}
          tenantId={tenantId}
          displayName={playerName ?? playerId}
          rows={entryData.data ?? []}
          isLoading={entryData.isLoading}
          error={entryData.error}
          onRefetch={entryData.refetch}
          onRowClick={onEntryClick}
          showLineCount={showLineCount}
          lineCountLabel={lineCountLabel}
        />
      )}
    </div>
  );
}
