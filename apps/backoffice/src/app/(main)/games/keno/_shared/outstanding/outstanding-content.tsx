"use client";

import { Clock, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GAME_COLORS } from "@/lib/game-colors";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { formatNumber, formatVNDCompact } from "@megawin/shared/utils";
import { REPORT_COLUMN_LABELS } from "@megawin/game-core/labels";
import { CalendarClock, Ticket, Banknote, HandCoins } from "lucide-react";
import type { OutstandingDrawReport } from "@megawin/game-keno/entities";
import { useKenoOutstanding } from "../../financial-reports/_lib/use-report-queries";
import { useKenoOutstandingFilters } from "./use-outstanding-filters";
import { OutstandingBreadcrumb } from "./outstanding-breadcrumb";
import { OutstandingDrawList } from "./outstanding-draw-list";
import { OutstandingTenantBreakdown } from "./outstanding-tenant-breakdown";
import { OutstandingPlayerBreakdown } from "./outstanding-player-breakdown";
import { OutstandingEntryList } from "./outstanding-entry-list";

const c = GAME_COLORS[GameProduct.Keno];

// ─── KPI Strip ────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("size-5", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
        <p className="truncate text-[11px] text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

/**
 * KPI Strip cho Keno Outstanding.
 *
 * Keno KHÔNG có lineCount — 4 KPI cards (kỳ, entries, HH, cược).
 * ~10+ draws active cùng lúc → sub text nhắc "~8 phút/kỳ".
 */
function KpiStrip({ data }: { data: OutstandingDrawReport[] }) {
  const totalEntries = data.reduce((s, r) => s + r.entryCount, 0);
  const totalStake = data.reduce((s, r) => s + r.totalStake, 0);
  const totalCommission = data.reduce((s, r) => s + r.estimatedCommission, 0);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiCard
        icon={CalendarClock}
        iconBg="bg-indigo-100 dark:bg-indigo-900/50"
        iconColor="text-indigo-600 dark:text-indigo-400"
        label="Kỳ đang hoạt động"
        value={String(data.length)}
        sub="kỳ quay chưa settle (~8 phút/kỳ)"
      />
      <KpiCard
        icon={Ticket}
        iconBg="bg-blue-100 dark:bg-blue-900/50"
        iconColor="text-blue-600 dark:text-blue-400"
        label={REPORT_COLUMN_LABELS.entryCount}
        value={formatNumber(totalEntries)}
        sub="entries đang chờ"
      />
      <KpiCard
        icon={HandCoins}
        iconBg="bg-amber-100 dark:bg-amber-900/50"
        iconColor="text-amber-600 dark:text-amber-400"
        label={REPORT_COLUMN_LABELS.estimatedCommission}
        value={formatVNDCompact(totalCommission)}
        sub="ước tính hoa hồng"
      />
      <KpiCard
        icon={Banknote}
        iconBg="bg-emerald-100 dark:bg-emerald-900/50"
        iconColor="text-emerald-600 dark:text-emerald-400"
        label={REPORT_COLUMN_LABELS.totalStake}
        value={formatVNDCompact(totalStake)}
        sub="tiền cược chưa settle"
      />
    </div>
  );
}

// ─── Live Dot ─────────────────────────────────────────────────────────────────

/**
 * Animated dot báo hiệu live data — click để force refresh.
 * Thay thế cho text "Cập nhật lúc..." + icon refresh button.
 */
function LiveDot({ isFetching, onRefresh }: { isFetching: boolean; onRefresh: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-muted/60 transition-colors"
          aria-label="Lấy dữ liệu mới nhất"
        >
          <span className="relative flex size-2">
            {isFetching ? (
              // Spinning khi đang fetch
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

function OutstandingSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-xl" />
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-3.5 w-72" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Orchestrator cho Keno Outstanding drill-down.
 *
 * Render đúng level component dựa trên URL state từ useKenoOutstandingFilters.
 * KpiStrip chỉ hiển thị ở Level 1 (4 cards — Keno không có lineCount).
 * Breadcrumb hiển thị từ Level 2 trở lên.
 */
export function OutstandingContent() {
  const { drawId, tenantId, playerId, playerName, level } = useKenoOutstandingFilters();

  const { data, isLoading, error, isFetching, refetch } = useKenoOutstanding();

  if (isLoading) return <OutstandingSkeleton />;

  const allRows = data ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* PageHeader */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${c.iconGradient} shadow-sm`}
          >
            <Clock className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Keno — Outstanding
            </h1>
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-muted-foreground">Entries chưa settle</p>
              <LiveDot isFetching={isFetching} onRefresh={() => refetch()} />
            </div>
          </div>
        </div>
      </div>

      {/* KPI Strip — chỉ Level 1 */}
      {level === "list" && <KpiStrip data={allRows} />}

      {/* Breadcrumb — từ Level 2 trở lên */}
      {level !== "list" && (
        <OutstandingBreadcrumb
          level={level}
          drawId={drawId}
          tenantId={tenantId}
          playerId={playerId}
          playerName={playerName}
        />
      )}

      {/* Error state */}
      {error && (
        <Card className="gap-0 py-0">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">Lỗi tải dữ liệu. Vui lòng thử lại.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 size-4" />
              Thử lại
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Level components */}
      {!error && level === "list" && <OutstandingDrawList data={allRows} />}

      {!error && level === "draw-tenants" && drawId && (
        <OutstandingTenantBreakdown drawId={drawId} />
      )}

      {!error && level === "players" && drawId && tenantId && (
        <OutstandingPlayerBreakdown drawId={drawId} tenantId={tenantId} />
      )}

      {!error && level === "entries" && drawId && tenantId && playerId && (
        <OutstandingEntryList
          drawId={drawId}
          tenantId={tenantId}
          accountId={playerId}
          playerName={playerName}
        />
      )}
    </div>
  );
}
