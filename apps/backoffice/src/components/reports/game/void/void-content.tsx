"use client";

import { Ban, RefreshCw } from "lucide-react";

import { FinancialDateRangePicker } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import type { VoidDrawRow, VoidDrillLevel, VoidEntryRow, VoidKpiData, VoidPlayerRow, VoidTenantRow } from "./types";
import { VoidBreadcrumb } from "./void-breadcrumb";
import { VoidDrawList } from "./void-draw-list";
import { VoidEntryList } from "./void-entry-list";
import { VoidKpiStrip } from "./void-kpi-strip";
import { VoidPlayerBreakdown } from "./void-player-breakdown";
import { VoidTenantBreakdown } from "./void-tenant-breakdown";

// ─── Sub-types cho async data ─────────────────────────────────────────────────

interface AsyncData<T> {
  data: T[] | undefined;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

/** Callbacks điều hướng drill-down. */
interface VoidNavigationCallbacks {
  navigateToList: () => void;
  navigateToDraw: (drawId: string) => void;
  navigateToTenant: (tenantId: string) => void;
  navigateToPlayer: (accountId: string, displayName?: string) => void;
}

export interface VoidContentProps {
  /** Game name hiển thị trong page header. VD: "Lotto 5/35". */
  gameName: string;
  /** Màu gradient cho icon header. VD: GAME_COLORS[GameProduct.Lotto535].iconGradient. */
  iconGradient: string;

  /** Date range filters. */
  from: string;
  to: string;
  onDateChange: (from: string, to: string) => void;

  /** URL state drill-down. */
  drawId: string | null;
  tenantId: string | null;
  playerId: string | null;
  playerName: string | null;
  level: VoidDrillLevel;

  /** Navigation callbacks. */
  navigation: VoidNavigationCallbacks;

  /** Level 1 data — danh sách kỳ quay void. */
  drawsData: AsyncData<VoidDrawRow>;

  /** Level 2 data — tenant breakdown cho drawId đang drill. */
  tenantData: AsyncData<VoidTenantRow>;

  /** Level 3 data — player breakdown cho draw + tenant đang drill. */
  playerData: AsyncData<VoidPlayerRow>;

  /** Level 4 data — entry list cho player đang drill. */
  entryData: AsyncData<VoidEntryRow>;

  /** Gọi khi click entry ở Level 4 — mở dialog chi tiết. */
  onEntryClick: (entry: VoidEntryRow) => void;

  /**
   * Game có cột "Bộ số / Dòng cược" không.
   * Lotto535, Mega645, Power655, Max3D, Max3DPro = true.
   * Keno, Bingo18 = false.
   */
  showLineCount?: boolean;

  /** Label cho cột dòng cược. Default: "Bộ số". */
  lineCountLabel?: string;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function VoidSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-xl" />
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-3.5 w-72" />
        </div>
      </div>
      <Skeleton className="h-12 w-full rounded-lg" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-18 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Void reports content orchestrator dùng chung cho mọi game.
 *
 * Render đúng level component dựa trên URL state.
 * KpiStrip và DateRangePicker chỉ hiển thị ở Level 1.
 * Breadcrumb hiển thị từ Level 2 trở lên.
 *
 * Game-specific logic (hooks, dialog) nằm ở game wrapper bên ngoài.
 */
export function VoidContent({
  gameName,
  iconGradient,
  from,
  to,
  onDateChange,
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
}: VoidContentProps) {
  const { navigateToList, navigateToDraw, navigateToTenant, navigateToPlayer } = navigation;

  if (drawsData.isLoading) {
    return <VoidSkeleton />;
  }

  const allRows = drawsData.data ?? [];

  const kpiData: VoidKpiData = {
    totalVoidedDraws: allRows.length,
    totalEntries: allRows.reduce((s, r) => s + r.entryCount, 0),
    totalOriginalStake: allRows.reduce((s, r) => s + r.totalOriginalStake, 0),
    totalRefundAmount: allRows.reduce((s, r) => s + r.totalRefundAmount, 0),
  };

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      {/* PageHeader + Date Range Picker */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br shadow-sm",
              iconGradient,
            )}
          >
            <Ban className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">{gameName} — Kỳ huỷ</h1>
            <p className="text-xs text-muted-foreground">Danh sách kỳ quay đã void và hoàn trả cho khách hàng</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <FinancialDateRangePicker from={from} to={to} onChange={onDateChange} />
        </div>
      </div>

      {/* KPI Strip — chỉ Level 1 */}
      {level === "list" && <VoidKpiStrip data={kpiData} />}

      {/* Breadcrumb — từ Level 2 trở lên */}
      {level !== "list" && (
        <VoidBreadcrumb
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

      {/* Error state — Level 1 */}
      {!!drawsData.error && level === "list" && (
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
      {!drawsData.error && level === "list" && <VoidDrawList data={allRows} onRowClick={navigateToDraw} />}

      {/* Level 2 — Tenant Breakdown */}
      {level === "draw-tenants" && drawId && (
        <VoidTenantBreakdown
          drawId={drawId}
          rows={tenantData.data ?? []}
          isLoading={tenantData.isLoading}
          error={tenantData.error}
          onRefetch={tenantData.refetch}
          onRowClick={navigateToTenant}
        />
      )}

      {/* Level 3 — Player Breakdown */}
      {level === "players" && drawId && tenantId && (
        <VoidPlayerBreakdown
          drawId={drawId}
          tenantId={tenantId}
          rows={playerData.data ?? []}
          isLoading={playerData.isLoading}
          error={playerData.error}
          onRefetch={playerData.refetch}
          onRowClick={navigateToPlayer}
        />
      )}

      {/* Level 4 — Entry List */}
      {level === "entries" && drawId && tenantId && playerId && (
        <VoidEntryList
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
