"use client";

import { formatVNDate, TZDate, todayVN, VN_TIMEZONE } from "@megawin/shared/utils";
import { subDays } from "date-fns";
import { parseAsInteger, parseAsString, parseAsStringEnum, useQueryState } from "nuqs";

type TabType = "draws" | "tenants";
type LevelType = "list" | "draw-tenants" | "tenant-draws" | "players" | "entries";

export function useLotto535ReportFilters() {
  const today = todayVN();
  const sevenDaysAgo = formatVNDate(subDays(new TZDate(new Date(), VN_TIMEZONE), 6));
  const [tab, rawSetTab] = useQueryState("tab", parseAsStringEnum<TabType>(["draws", "tenants"]).withDefault("draws"));
  const [from, setFrom] = useQueryState("from", parseAsString.withDefault(sevenDaysAgo));
  const [to, setTo] = useQueryState("to", parseAsString.withDefault(today));
  const [level, setLevel] = useQueryState(
    "level",
    parseAsStringEnum<LevelType>(["list", "draw-tenants", "tenant-draws", "players", "entries"]).withDefault("list"),
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
    void setTenantId(null, { history: "push" });
    void setAccountId(null, { history: "push" });
    void setPlayerName(null, { history: "push" });
    void setLevel("draw-tenants", { history: "push" });
    void setPage(1);
  }

  function navigateToPlayersInDraw(tId: string) {
    void setTenantId(tId, { history: "push" });
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

  function navigateToDrawInTenant(dId: string, tId: string) {
    void setDrawId(dId, { history: "push" });
    void setTenantId(tId, { history: "push" });
    void setLevel("draw-tenants", { history: "push" });
  }

  function navigateToEntriesFromTenant(aId: string, name?: string) {
    void setAccountId(aId, { history: "push" });
    void setPlayerName(name ?? null, { history: "push" });
    void setLevel("entries", { history: "push" });
  }

  function navigateBackToPlayers() {
    void setAccountId(null, { history: "push" });
    void setPlayerName(null, { history: "push" });
    void setLevel("players", { history: "push" });
  }

  function navigateBackToTenantDraws() {
    void setDrawId(null, { history: "push" });
    void setAccountId(null, { history: "push" });
    void setPlayerName(null, { history: "push" });
    void setLevel("tenant-draws", { history: "push" });
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
    navigateToPlayersInDraw,
    navigateToEntries,
    navigateToTenantDrills,
    navigateToTenantInDraw,
    navigateToDrawInTenant,
    navigateToEntriesFromTenant,
    navigateBackToPlayers,
    navigateBackToTenantDraws,
    navigateToList,
  };
}
