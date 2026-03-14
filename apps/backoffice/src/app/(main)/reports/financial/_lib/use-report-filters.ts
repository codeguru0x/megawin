import { useQueryState, parseAsString, parseAsStringLiteral } from "nuqs";
import { useCallback } from "react";
import { todayVN } from "@megawin/shared/utils/date";

const SYSTEM_TABS = ["daily", "by-game", "by-tenant"] as const;

/** URL state hook cho System Financial Reports page. */
export function useSystemReportFilters() {
  const today = todayVN();

  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(SYSTEM_TABS).withDefault("daily"),
  );
  const [from, setFrom] = useQueryState("from", parseAsString.withDefault(today));
  const [to, setTo] = useQueryState("to", parseAsString.withDefault(today));
  const [expandedDate, setExpandedDate] = useQueryState("date", parseAsString);
  const [expandedTenant, setExpandedTenant] = useQueryState("tenant", parseAsString);

  const resetExpanded = useCallback(() => {
    void setExpandedDate(null);
    void setExpandedTenant(null);
  }, [setExpandedDate, setExpandedTenant]);

  return {
    tab,
    setTab,
    from,
    to,
    setFrom,
    setTo,
    expandedDate,
    setExpandedDate,
    expandedTenant,
    setExpandedTenant,
    resetExpanded,
  };
}
