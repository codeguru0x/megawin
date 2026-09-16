import { getFinancialDate } from "@megawin/shared/utils";
import { format, subDays } from "date-fns";

/**
 * Tính bộ ngày tài chính Dashboard (today / yesterday / compare).
 *
 * Dùng chung `useDashboardFilters` và `prefetchDashboardQueries` — một nguồn chân lý.
 */
export function getDashboardFdRange(): {
  todayFd: string;
  yesterdayFd: string;
  compareFd: string;
} {
  const todayFd = getFinancialDate(new Date());
  // Hôm qua = ngày tài chính đã đóng gần nhất → data hoàn chỉnh
  const yesterdayFd = format(subDays(new Date(`${todayFd}T12:00:00`), 1), "yyyy-MM-dd");
  // So sánh hôm qua với cùng thứ tuần trước (yesterdayFd - 7 ngày)
  const compareFd = format(subDays(new Date(`${yesterdayFd}T12:00:00`), 7), "yyyy-MM-dd");
  return { todayFd, yesterdayFd, compareFd };
}

/**
 * Dashboard filters — today-only mode (Phương án C).
 *
 * Dashboard luôn hiện dữ liệu ngày tài chính HÔM NAY (partial, live).
 * Kèm theo dữ liệu HÔM QUA (đã đóng) + trend % so với cùng thứ tuần trước
 * để operator có context so sánh mà không cần date picker.
 *
 * - `todayFd`: ngày tài chính hôm nay → dùng cho Hero KPIs, Game Performance
 * - `yesterdayFd`: ngày tài chính hôm qua → dùng cho dòng "Hôm qua" trên KPI card
 * - `compareFd`: cùng thứ tuần trước (yesterdayFd - 7) → dùng cho trend % của hôm qua
 */
export function useDashboardFilters() {
  return getDashboardFdRange();
}
