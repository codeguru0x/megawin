"use client";

import { useQueryState, parseAsString, parseAsStringEnum, parseAsInteger } from "nuqs";
import { todayVN } from "@megawin/shared/utils/date";

type TabType = "draws" | "tenants";
type LevelType = "list" | "draw-tenants" | "tenant-draws" | "players" | "entries";

/** nuqs state management cho Keno financial reports. */
export function useKenoReportFilters() {
  const today = todayVN();
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringEnum<TabType>(["draws", "tenants"]).withDefault("draws"),
  );
  const [from, setFrom] = useQueryState("from", parseAsString.withDefault(today));
  const [to, setTo] = useQueryState("to", parseAsString.withDefault(today));
  const [level, setLevel] = useQueryState(
    "level",
    parseAsStringEnum<LevelType>([
      "list",
      "draw-tenants",
      "tenant-draws",
      "players",
      "entries",
    ]).withDefault("list"),
  );
  const [drawId, setDrawId] = useQueryState("drawId", parseAsString);
  const [tenantId, setTenantId] = useQueryState("tenantId", parseAsString);
  const [accountId, setAccountId] = useQueryState("accountId", parseAsString);
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));

  function navigateToDraw(id: string) {
    void setDrawId(id);
    void setLevel("draw-tenants");
    void setPage(1);
  }

  function navigateToPlayer(aId: string) {
    void setAccountId(aId);
    void setLevel("players");
  }

  function navigateToEntries(aId: string) {
    void setAccountId(aId);
    void setLevel("entries");
  }

  function navigateToTenantDrills(tId: string) {
    void setTenantId(tId);
    void setLevel("tenant-draws");
  }

  function navigateToTenantInDraw(tId: string) {
    void setTenantId(tId);
  }

  function navigateToList() {
    void setDrawId(null);
    void setTenantId(null);
    void setAccountId(null);
    void setLevel("list");
    void setPage(1);
  }

  return {
    tab,
    setTab,
    from,
    setFrom,
    to,
    setTo,
    level,
    setLevel,
    drawId,
    tenantId,
    accountId,
    page,
    setPage,
    navigateToDraw,
    navigateToPlayer,
    navigateToEntries,
    navigateToTenantDrills,
    navigateToTenantInDraw,
    navigateToList,
  };
}
