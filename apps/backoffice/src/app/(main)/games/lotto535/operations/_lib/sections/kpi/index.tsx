"use client";

/**
 * Lotto 5/35 – KPI Section (tab Giám sát)
 *
 * Đọc snapshot (timer 1) qua `select` slice `stats` → KpiStrip. Exposure card đọc
 * `select` slice `exposure` riêng → KPI đổi không kéo Exposure re-render (React Query
 * dedupe 1 query, mỗi `select` chặn cross re-render). Click Exposure card → chuyển
 * sang tab Phân tích cược.
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

  // Slice `stats` + `uniquePlayers` → KpiStrip. Inline arrow (không useCallback) — luôn
  // tạo mới mỗi render nên `status`/`official` trong closure luôn tươi, tránh rủi ro
  // select kẹt giá trị cũ khi drawDetail về sau snapshot.
  const { data: kpi, isLoading } = useOpsSnapshot<OpsKpi | null>(effectiveDrawId, isSettled, (s) =>
    s.stats ? toKpi(s.stats, s.uniquePlayers, status, official) : null,
  );

  // Slice `exposure` + `thresholds.fixedExposureWarnAmount` → ExposureCard (query dedupe
  // với slice trên, không request thêm).
  const { data: exposure } = useOpsSnapshot<ExposureViewWithThreshold | null>(
    effectiveDrawId,
    isSettled,
    (s) =>
      s.exposure
        ? {
            view: toExposureView(s.exposure),
            warnAmount: s.thresholds.fixedExposureWarnAmount,
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
          warnAmount={exposure.warnAmount}
          onOpenAnalysis={onOpenAnalysis}
        />
      )}
    </div>
  );
}
