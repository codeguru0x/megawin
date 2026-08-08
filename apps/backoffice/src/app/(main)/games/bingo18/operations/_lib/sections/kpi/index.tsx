"use client";

/**
 * Bingo 18 – KPI Section (tab Giám sát)
 *
 * Đọc snapshot (timer 1) qua `select` slice → KpiStrip + ExposureCard.
 * Mỗi slice riêng → KPI đổi không kéo Exposure re-render (React Query dedupe 1 query).
 */

import { DrawStatus } from "@megawin/game-core/entities";
import type { Bingo18ExposureResult } from "@megawin/game-bingo18/rules";

import { Skeleton } from "@/components/ui/skeleton";

import { toKpi } from "../../adapters";
import { EXPOSURE_WARN_REVENUE_PCT_DEFAULT } from "../../ops-constants";
import type { OpsKpi } from "../../types";
import { useDrawContext } from "../../use-draw-context";
import { useOpsSnapshot } from "../../use-operations";
import { ExposureCard } from "./exposure-card";
import { KpiStrip } from "./kpi-strip";

const KPI_SHOW = new Set<string>([
  DrawStatus.SalesOpen,
  DrawStatus.SalesClosed,
  DrawStatus.Published,
  DrawStatus.Settling,
  DrawStatus.Settled,
]);

/** Slice exposure + ngưỡng cho ExposureCard — gom 1 object để select 1 lần. */
interface ExposureSlice {
  exposure: Bingo18ExposureResult;
  revenue: number;
  warnRevenuePct: number;
  warnMinAmount: number;
}

export function KpiSection() {
  const { draw, effectiveDrawId, isSettled } = useDrawContext();

  // Slice `totals` + `uniquePlayers` → KpiStrip.
  const { data: kpi, isLoading } = useOpsSnapshot<OpsKpi | null>(effectiveDrawId, isSettled, (s) =>
    s.stats ? toKpi(s.stats, s.uniquePlayers) : null,
  );

  // Slice `exposure` (chính xác 216) + thresholds — fallback default CHỈ lúc loading.
  const { data: exposureSlice } = useOpsSnapshot<ExposureSlice | null>(effectiveDrawId, isSettled, (s) =>
    s.exposure && s.stats
      ? {
          exposure: s.exposure,
          revenue: s.stats.totals.revenue,
          warnRevenuePct: s.thresholds.exposureWarnRevenuePct ?? EXPOSURE_WARN_REVENUE_PCT_DEFAULT,
          warnMinAmount: s.thresholds.exposureWarnMinAmount ?? 0,
        }
      : null,
  );

  if (!draw || !KPI_SHOW.has(draw.status as string)) return null;

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-18 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!kpi) return null;

  return (
    <section className="space-y-3">
      <KpiStrip kpi={kpi} />
      {exposureSlice && (
        <ExposureCard
          exposure={exposureSlice.exposure}
          revenue={exposureSlice.revenue}
          warnRevenuePct={exposureSlice.warnRevenuePct}
          warnMinAmount={exposureSlice.warnMinAmount}
        />
      )}
    </section>
  );
}
