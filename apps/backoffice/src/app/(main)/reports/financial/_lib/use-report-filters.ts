"use client";

import { useQueryState, parseAsString, parseAsStringLiteral } from "nuqs";
import { todayVN } from "@megawin/shared/utils/date";

const SYSTEM_TABS = ["daily", "by-game", "by-tenant"] as const;

/** URL state hook cho System Financial Reports page. */
export function useSystemReportFilters() {
  const today = todayVN();

  const [tab, rawSetTab] = useQueryState(
    "tab",
    parseAsStringLiteral(SYSTEM_TABS).withDefault("daily"),
  );
  const [from, rawSetFrom] = useQueryState("from", parseAsString.withDefault(today));
  const [to, rawSetTo] = useQueryState("to", parseAsString.withDefault(today));

  /** Ngày được chọn xem chi tiết (tab Daily) */
  const [selectedDate, setSelectedDate] = useQueryState("date", parseAsString);

  /** Tenant được chọn xem chi tiết (tab By Tenant) */
  const [selectedTenant, setSelectedTenant] = useQueryState("tenant", parseAsString);

  function setTab(t: (typeof SYSTEM_TABS)[number]) {
    void rawSetTab(t, { history: "push" });
    void setSelectedDate(null);
    void setSelectedTenant(null);
  }

  /**
   * Thay đổi date range → xoá drill-down state để tránh hiển thị
   * dữ liệu cũ của 1 ngày không còn thuộc range mới.
   */
  function setFrom(f: string) {
    void rawSetFrom(f);
    void setSelectedDate(null);
    void setSelectedTenant(null);
  }

  function setTo(t: string) {
    void rawSetTo(t);
    void setSelectedDate(null);
    void setSelectedTenant(null);
  }

  function navigateToDate(date: string) {
    void setSelectedDate(date, { history: "push" });
  }

  function navigateToTenant(tenantId: string) {
    void setSelectedTenant(tenantId, { history: "push" });
  }

  function navigateBackToList() {
    void setSelectedDate(null, { history: "push" });
    void setSelectedTenant(null, { history: "push" });
  }

  return {
    tab,
    setTab,
    from,
    to,
    setFrom,
    setTo,
    selectedDate,
    selectedTenant,
    navigateToDate,
    navigateToTenant,
    navigateBackToList,
  };
}
