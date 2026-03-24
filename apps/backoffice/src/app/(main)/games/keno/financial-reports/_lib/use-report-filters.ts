"use client";

import { useQueryState, parseAsString, parseAsStringEnum, parseAsInteger } from "nuqs";
import { todayVN } from "@megawin/shared/utils";

type TabType = "draws" | "tenants";
type LevelType = "list" | "draw-tenants" | "tenant-draws" | "players" | "entries";

/** nuqs state management cho Keno financial reports. */
export function useKenoReportFilters() {
  const today = todayVN();
  const [tab, rawSetTab] = useQueryState(
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
  const [playerName, setPlayerName] = useQueryState("playerName", parseAsString);
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));

  function setTab(t: TabType) {
    void rawSetTab(t, { history: "push" });
    void setDrawId(null);
    void setTenantId(null);
    void setAccountId(null);
    void setPlayerName(null);
    void setLevel("list");
  }

  function navigateToDraw(id: string) {
    void setDrawId(id, { history: "push" });
    void setLevel("draw-tenants", { history: "push" });
    void setPage(1);
  }

  function navigateToPlayer(aId: string, name?: string) {
    void setAccountId(aId, { history: "push" });
    void setPlayerName(name ?? null, { history: "push" });
    void setLevel("players", { history: "push" });
  }

  function navigateToEntries(aId: string, name?: string) {
    void setAccountId(aId, { history: "push" });
    void setPlayerName(name ?? null, { history: "push" });
    void setLevel("entries", { history: "push" });
  }

  function navigateToTenantDrills(tId: string) {
    void setTenantId(tId, { history: "push" });
    void setLevel("tenant-draws", { history: "push" });
  }

  function navigateToTenantInDraw(tId: string) {
    void setTenantId(tId, { history: "push" });
  }

  /** Drill từ tab Đại lý → kỳ quay cụ thể mà KHÔNG chuyển sang tab Theo kỳ quay. */
  function navigateToDrawInTenant(dId: string, tId: string) {
    void setDrawId(dId, { history: "push" });
    void setTenantId(tId, { history: "push" });
    void setLevel("draw-tenants", { history: "push" });
  }

  function navigateToList() {
    void setDrawId(null, { history: "push" });
    void setTenantId(null, { history: "push" });
    void setAccountId(null, { history: "push" });
    void setPlayerName(null, { history: "push" });
    void setLevel("list", { history: "push" });
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
    playerName,
    page,
    setPage,
    navigateToDraw,
    navigateToPlayer,
    navigateToEntries,
    navigateToTenantDrills,
    navigateToTenantInDraw,
    navigateToDrawInTenant,
    navigateToList,
  };
}
