/**
 * Map href sidebar → React Query prefetch on hover-intent (p1-02).
 *
 * Mỗi `prefetch*` sống cạnh hook trang đích (`_lib/use-*-queries.ts`) — cùng
 * `queryKey` / `queryFn` / `staleTime`. File này chỉ điều phối theo URL.
 */

import type { QueryClient } from "@tanstack/react-query";

import { prefetchAuditLogsFirstPage } from "@/app/(main)/audit-logs/_lib/use-queries";
import { prefetchDashboardQueries } from "@/app/(main)/dashboard/_lib/use-dashboard-queries";
import { prefetchOpsHub as prefetchBingo18OpsHub } from "@/app/(main)/games/bingo18/operations-hub/_lib/use-hub-query";
import { prefetchOpsHub as prefetchKenoOpsHub } from "@/app/(main)/games/keno/operations-hub/_lib/use-hub-query";
import { prefetchSystemOutstanding } from "@/app/(main)/reports/settle/_lib/use-report-queries";
import { prefetchResultfeedDashboard } from "@/app/(main)/resultfeed/_lib/use-queries";
import { prefetchWorkersHealth } from "@/app/(main)/system/workers/_lib/use-queries";

/**
 * Map href sidebar → prefetch data tương ứng. `undefined` = không prefetch RQ (chỉ shell).
 */
export function getNavDataPrefetch(href: string, qc: QueryClient): (() => void) | undefined {
  switch (href) {
    case "/":
    case "/dashboard":
      return () => prefetchDashboardQueries(qc);
    case "/games/keno/operations-hub":
      return () => prefetchKenoOpsHub(qc);
    case "/games/bingo18/operations-hub":
      return () => prefetchBingo18OpsHub(qc);
    case "/reports/outstanding":
      return () => prefetchSystemOutstanding(qc);
    case "/system/workers":
      return () => prefetchWorkersHealth(qc);
    case "/resultfeed":
      return () => prefetchResultfeedDashboard(qc);
    case "/audit-logs":
      return () => prefetchAuditLogsFirstPage(qc);
    default:
      return undefined;
  }
}
