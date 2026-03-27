"use client";

import { Suspense, useEffect, useRef } from "react";
import Link from "next/link";
import { Radio, SearchX } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { max3dproKeys } from "@/lib/query-keys";
import { displayVNTimeWithSeconds } from "@megawin/shared/utils";

import { DrawContextProvider, useDrawContext } from "./_lib/use-draw-context";
import { DrawSelector } from "./_lib/draw-selector";
import { DrawManagementSection } from "./_lib/sections/draw-management";
import { KpiSection } from "./_lib/sections/kpi";
import { ResultSection } from "./_lib/sections/result";
import { AnalyticsSection } from "./_lib/sections/analytics";
import { CreateDrawDialog } from "../draws/_lib/create-draw-dialog";

// ─── Last Updated Badge ───────────────────────────────────────────────────────

/**
 * Hiển thị thời điểm cập nhật dữ liệu live cuối cùng.
 *
 * Theo dõi opsSummary (refetch mỗi 30s) — là query phản ánh
 * dữ liệu live chính xác nhất cho kỳ đang active.
 */
function LastUpdatedBadge({
  opsParams,
}: {
  opsParams: { drawId?: string; financialDate?: string };
}) {
  const qc = useQueryClient();
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    function tick() {
      const queryKey = max3dproKeys.opsSummary(opsParams as Record<string, unknown>);
      const state = qc.getQueryState(queryKey);
      const ts = state?.dataUpdatedAt;
      if (spanRef.current && ts) {
        spanRef.current.textContent = displayVNTimeWithSeconds(new Date(ts));
      }
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [qc, opsParams]);

  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground/70 tabular-nums">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
      </span>
      Live · <span ref={spanRef} />
    </span>
  );
}

// ─── Inner page (accesses context) ───────────────────────────────────────────

function OperationsContent() {
  const {
    draws,
    draw,
    effectiveDrawId,
    onSelectDraw,
    drawNotFound,
    noDrawAvailable,
    isHistorical,
    isActiveForRefresh,
    opsParams,
  } = useDrawContext();

  if (drawNotFound || noDrawAvailable) return <DrawNotFound noData={noDrawAvailable} />;

  return (
    <div className="@container/main flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-pink-500 to-pink-600 shadow-sm">
            <Radio className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Max 3D Pro — Vận hành
            </h1>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Quản lý và giám sát kỳ quay</p>
              {isActiveForRefresh ? <LastUpdatedBadge opsParams={opsParams} /> : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <DrawSelector
            draws={draws}
            selectedDrawId={effectiveDrawId}
            onSelect={onSelectDraw}
            historicalDraw={isHistorical ? draw : undefined}
          />
          {/* CreateDrawDialog tự quản lý state nội bộ + trigger button */}
          <CreateDrawDialog />
        </div>
      </div>

      {/* Zone 1: Draw management — command center + dialogs */}
      <DrawManagementSection />

      {/* Zone 2: KPI strip */}
      <KpiSection />

      {/* Zone 3: Result + Financial — hiển thị khi có kết quả */}
      <ResultSection />

      {/* Zone 4: Analytics — play mode, triplet freq, live feed */}
      <AnalyticsSection />
    </div>
  );
}

// ─── Draw Not Found ──────────────────────────────────────────────────────────

function DrawNotFound({ noData = false }: { noData?: boolean }) {
  return (
    <div className="@container/main flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-pink-500 to-pink-600 shadow-sm">
            <Radio className="size-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Max 3D Pro — Vận hành
            </h1>
            <p className="text-xs text-muted-foreground">Quản lý và giám sát kỳ quay</p>
          </div>
        </div>
        {noData && <CreateDrawDialog />}
      </div>

      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <SearchX className="size-6 text-muted-foreground" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-foreground">
          {noData ? "Chưa có kỳ quay nào" : "Không tìm thấy kỳ quay"}
        </h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {noData
            ? "Hệ thống chưa có kỳ quay nào được tạo. Hãy tạo kỳ quay đầu tiên để bắt đầu vận hành."
            : "Kỳ quay được yêu cầu không tồn tại hoặc đã bị xóa khỏi hệ thống."}
        </p>
        <div className="mt-5 flex items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/games/max3dpro/draws">Lịch sử kỳ quay</Link>
          </Button>
          {!noData && (
            <Button size="sm" asChild>
              <Link href="/games/max3dpro/operations">Về trang vận hành</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────

export default function Max3dproOperationsPage() {
  return (
    <Suspense>
      <DrawContextProvider>
        <OperationsContent />
      </DrawContextProvider>
    </Suspense>
  );
}
