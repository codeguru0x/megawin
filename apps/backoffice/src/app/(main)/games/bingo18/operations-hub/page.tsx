"use client";

/**
 * Bingo18 — Ops Hub (Trung tâm vận hành đa kỳ)
 *
 * Trang giám sát TẤT CẢ kỳ chưa hoàn thành cùng lúc (~158 kỳ/ngày), khác hẳn trang
 * `operations` (1 kỳ, sâu). Chỉ 1 query cho toàn trang (`useHubQuery`, qua `HubProvider`) —
 * mọi zone `select` slice từ context, không zone nào tự fetch (plan p1-01 §3, §4).
 *
 * Zone 1-4 implement ở p1-01 (page shell + KPI + Day Flow + alert banner). Zone 5A/5B/9
 * (bảng vận hành + bảng đang bán + bulk action + Focus Rail) ở p1-02. Zone 6 (chi tiết) là
 * inline expand (0 query, trong Zone 5A) + nút mở tab mới — p1-03, KHÔNG Sheet (guideline §7).
 *
 * Phím tắt cấp trang (`useHubKeyboard`, p1-02i): `Enter` mở kỳ đang focus ở TAB MỚI (khác
 * click chuột vào dòng = toggle inline expand, 0 query) — dùng `window.open` vì đây là hành
 * động từ bàn phím, không có element `<Link>` cụ thể để giữ Cmd/Ctrl+click (khác nút
 * "Chi tiết ↗" trong expand panel — nút đó PHẢI dùng `<Link>`, xem `hub-expand-panel.tsx`).
 */

import { Suspense } from "react";

import { GameProduct } from "@megawin/game-core/entities";

import { drawOperationsHref } from "@/app/(main)/games/_lib/operations/draw-operations-link";

import { HubAlertBanner } from "./_lib/hub-alert-banner";
import { HubKpiStrip, HubKpiStripSkeleton } from "./_lib/hub-kpi-strip";
import { HubPageHeader, HubPageHeaderSkeleton } from "./_lib/hub-page-header";
import { HubTimelineRail, HubTimelineRailSkeleton } from "./_lib/hub-timeline-rail";
import { HubBulkActionBar } from "./_lib/sections/queue/hub-bulk-action-bar";
import { HubQueueTable } from "./_lib/sections/queue/hub-queue-table";
import { HubSellingSection } from "./_lib/sections/queue/hub-selling-section";
import { useHubKeyboard } from "./_lib/sections/queue/use-hub-keyboard";
import { HubProvider } from "./_lib/use-hub-context";

/**
 * Skeleton khớp CHIỀU CAO layout thật (header ~52px + Zone 2 ~168px + Day Flow ~120px + gap).
 * Lệch chiều cao gây layout shift (`vercel-react-best-practices` §1.5) — trang monitor 8 tiếng
 * thì mỗi lần nhảy là một lần mỏi mắt.
 */
function HubSkeleton() {
  return (
    <div className="@container/main flex flex-col gap-4">
      <HubPageHeaderSkeleton />
      <HubKpiStripSkeleton />
      <HubTimelineRailSkeleton />
    </div>
  );
}

/** `window.open` cho phím tắt Enter — xem lý do ở JSDoc đầu file. */
function openDrawInNewTab(drawId: string) {
  window.open(drawOperationsHref(GameProduct.Bingo18, drawId), "_blank", "noopener");
}

function HubPageContent() {
  useHubKeyboard(openDrawInNewTab);

  return (
    <div className="@container/main flex flex-col gap-4">
      <HubPageHeader />
      <HubKpiStrip />
      <HubTimelineRail />
      <HubAlertBanner />

      {/* Zone 5A + 5B cạnh nhau ở màn rộng (`@container` — guideline §1.4), xếp dọc ở màn hẹp.
          `minmax(0,Nfr)` — KHÔNG `Nfr` trần: `1fr` tự resolve `minmax(auto,1fr)`, cột có
          `min-content` cao (bảng nhiều cột) sẽ đẩy tỉ lệ thật lệch khỏi tỉ lệ khai báo (bug đã
          đo được ở review 07/09 §A3: khai `2fr_1fr` nhưng render `593px/1146px` — ngược tỉ lệ).
          `minmax(0,_)` cho phép cột co xuống dưới `min-content`, tỉ lệ `fr` mới thực sự có hiệu
          lực. Rail đã chuyển full-width (trên) nên cột phải giờ chỉ chứa 5B — không còn nguồn
          đẩy `min-content` lớn, bug tự khỏi cả khi dùng `fr` trần, nhưng giữ `minmax(0,_)` để
          không tái phát nếu 5B thêm nội dung rộng trong tương lai. */}
      <div className="grid @4xl/main:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] grid-cols-1 gap-4">
        <HubQueueTable />
        <HubSellingSection />
      </div>

      {/* Sticky bottom — chỉ hiện khi có selection (p1-02g). */}
      <HubBulkActionBar />
    </div>
  );
}

export default function Bingo18OperationsHubPage() {
  return (
    <Suspense fallback={<HubSkeleton />}>
      <HubProvider>
        <HubPageContent />
      </HubProvider>
    </Suspense>
  );
}
