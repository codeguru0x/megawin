"use client";

import { useQueryState, parseAsString, parseAsStringLiteral } from "nuqs";
import { todayVN } from "@megawin/shared/utils";

const TABS = ["draws", "tenants"] as const;
export type DrillLevel = "list" | "draw-tenants" | "players" | "entries" | "tenant-draws";

/** URL state hook cho Max3D Financial Reports page. */
export function useMax3DReportFilters() {
  const today = todayVN();

  const [tab, rawSetTab] = useQueryState("tab", parseAsStringLiteral(TABS).withDefault("draws"));
  const [from, setFrom] = useQueryState("from", parseAsString.withDefault(today));
  const [to, setTo] = useQueryState("to", parseAsString.withDefault(today));
  const [drawId, setDrawId] = useQueryState("draw", parseAsString);
  const [tenantId, setTenantId] = useQueryState("tenant", parseAsString);
  const [playerId, setPlayerId] = useQueryState("player", parseAsString);
  const [playerName, setPlayerName] = useQueryState("playerName", parseAsString);

  // Tính drill level từ URL state
  const level: DrillLevel = playerId
    ? "entries"
    : tenantId && drawId
      ? "players"
      : drawId
        ? "draw-tenants"
        : tenantId
          ? "tenant-draws"
          : "list";

  function setTab(t: (typeof TABS)[number]) {
    void rawSetTab(t, { history: "push" });
    void setDrawId(null);
    void setTenantId(null);
    void setPlayerId(null);
    void setPlayerName(null);
  }

  function navigateToList() {
    void setDrawId(null, { history: "push" });
    void setTenantId(null, { history: "push" });
    void setPlayerId(null, { history: "push" });
    void setPlayerName(null, { history: "push" });
  }

  function navigateToDraw(id: string) {
    void setDrawId(id, { history: "push" });
    void setTenantId(null, { history: "push" });
    void setPlayerId(null, { history: "push" });
    void setPlayerName(null, { history: "push" });
  }

  function navigateToTenantInDraw(id: string) {
    void setTenantId(id, { history: "push" });
    void setPlayerId(null, { history: "push" });
    void setPlayerName(null, { history: "push" });
  }

  function navigateToPlayer(id: string, name?: string) {
    void setPlayerId(id, { history: "push" });
    void setPlayerName(name ?? null, { history: "push" });
  }

  function navigateToTenantDrills(id: string) {
    void setTenantId(id, { history: "push" });
    void setDrawId(null, { history: "push" });
    void setPlayerId(null, { history: "push" });
    void setPlayerName(null, { history: "push" });
  }

  /** Drill từ tab Đại lý → kỳ quay cụ thể mà KHÔNG chuyển sang tab Theo kỳ quay. */
  function navigateToDrawInTenant(dId: string, tId: string) {
    void setDrawId(dId, { history: "push" });
    void setTenantId(tId, { history: "push" });
    void setPlayerId(null, { history: "push" });
    void setPlayerName(null, { history: "push" });
  }

  return {
    tab,
    setTab,
    from,
    to,
    setFrom,
    setTo,
    drawId,
    tenantId,
    playerId,
    playerName,
    level,
    navigateToList,
    navigateToDraw,
    navigateToTenantInDraw,
    navigateToPlayer,
    navigateToTenantDrills,
    navigateToDrawInTenant,
  };
}
