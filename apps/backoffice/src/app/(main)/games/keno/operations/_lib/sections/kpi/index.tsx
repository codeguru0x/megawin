"use client";

/**
 * Keno – KPI Section (tab Giám sát)
 *
 * Đọc snapshot (timer 1) qua `select` slice `totals` → KpiStrip. Exposure card đọc
 * `select` slice `exposure` riêng → KPI đổi không kéo Exposure re-render (§4.2).
 * Click Exposure card → chuyển sang tab Phân tích cược.
 */

import { Skeleton } from "@/components/ui/skeleton";

import type { OfficialFinancialSlice } from "../../adapters";
import { toExposureView, toKpi } from "../../adapters";
import type { ExposureViewWithThreshold, OpsKpi } from "../../types";
import { useDrawContext } from "../../use-draw-context";
import { useDrawDetail, useOpsSnapshot } from "../../use-operations";
import { ExposureCard } from "./exposure-card";
import { KpiStrip } from "./kpi-strip";

export function KpiSection({ onOpenAnalysis }: { onOpenAnalysis?: () => void }) {
  const { effectiveDrawId, status, isSettled } = useDrawContext();

  // Số chính thức từ settle — chỉ fetch khi Settled; queryKey trùng ResultSection/
  // DrawManagement → react-query dedupe, zero request thêm khi các section đó đã fetch.
  const { data: drawDetail } = useDrawDetail(isSettled ? effectiveDrawId : undefined);
  const official: OfficialFinancialSlice | undefined = drawDetail?.draw
    ? {
        financial: drawDetail.draw.financial
          ? {
              totalRevenue: drawDetail.draw.financial.totalRevenue,
              totalAgentCommission: drawDetail.draw.financial.totalAgentCommission,
            }
          : undefined,
        ticketEntryCount: drawDetail.draw.stats?.ticketEntryCount,
      }
    : undefined;

  // Slice `totals` + `uniquePlayers` → KpiStrip. `select` chặn re-render khi field khác đổi.
  // Inline arrow (không useCallback) — luôn tạo mới mỗi render nên `status`/`official` trong
  // closure luôn tươi, tránh rủi ro select kẹt giá trị cũ khi drawDetail về sau snapshot.
  const { data: kpi, isLoading } = useOpsSnapshot<OpsKpi | null>(effectiveDrawId, isSettled, (s) =>
    s.stats ? toKpi(s.stats, s.uniquePlayers, status, official) : null,
  );

  // Slice `exposure` → ExposureCard (query dedupe với slice trên, không request thêm).
  // worstCaseTotal lấy từ `cappedExposure` (ĐÃ cap); mẫu số + ngưỡng từ `thresholds` config.
  const { data: exposure } = useOpsSnapshot<ExposureViewWithThreshold | null>(
    effectiveDrawId,
    isSettled,
    (s) =>
      s.stats
        ? {
            view: toExposureView(
              s.stats,
              s.cappedExposure?.worstCaseTotal ?? 0,
              s.thresholds.maxSetsForFixed,
            ),
            warnPct: s.thresholds.exposureWarnPct,
          }
        : null,
  );

  if (!effectiveDrawId) return null;

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
    <div className="space-y-3">
      <KpiStrip kpi={kpi} />
      {exposure && (
        <ExposureCard
          exposure={exposure.view}
          warnPct={exposure.warnPct}
          onOpenAnalysis={onOpenAnalysis}
        />
      )}
    </div>
  );
}
