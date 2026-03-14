"use client";

import { useQueryState, parseAsString, parseAsStringLiteral } from "nuqs";
import { useCallback } from "react";
import { todayVN } from "@megawin/shared/utils/date";

const TABS = ["draws", "tenants"] as const;

export type DrillLevel = "list" | "draw-tenants" | "players" | "entries" | "tenant-draws";

/** URL state hook cho Mega 6/45 Financial Reports page. */
export function useMega645ReportFilters() {
  const today = todayVN();
  const [tab, setTab] = useQueryState("tab", parseAsStringLiteral(TABS).withDefault("draws"));
  const [from, setFrom] = useQueryState("from", parseAsString.withDefault(today));
  const [to, setTo] = useQueryState("to", parseAsString.withDefault(today));
  const [drawId, setDrawId] = useQueryState("draw", parseAsString);
  const [tenantId, setTenantId] = useQueryState("tenant", parseAsString);
  const [playerId, setPlayerId] = useQueryState("player", parseAsString);

  const level: DrillLevel = playerId
    ? "entries"
    : tenantId && drawId
      ? "players"
      : drawId
        ? "draw-tenants"
        : tenantId
          ? "tenant-draws"
          : "list";

  const navigateToList = useCallback(() => {
    void setDrawId(null);
    void setTenantId(null);
    void setPlayerId(null);
  }, [setDrawId, setTenantId, setPlayerId]);
  const navigateToDraw = useCallback(
    (id: string) => {
      void setDrawId(id);
      void setTenantId(null);
      void setPlayerId(null);
    },
    [setDrawId, setTenantId, setPlayerId],
  );
  const navigateToTenantInDraw = useCallback(
    (id: string) => {
      void setTenantId(id);
      void setPlayerId(null);
    },
    [setTenantId, setPlayerId],
  );
  const navigateToPlayer = useCallback(
    (id: string) => {
      void setPlayerId(id);
    },
    [setPlayerId],
  );
  const navigateToTenantDrills = useCallback(
    (id: string) => {
      void setTenantId(id);
      void setDrawId(null);
      void setPlayerId(null);
    },
    [setTenantId, setDrawId, setPlayerId],
  );

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
    level,
    navigateToList,
    navigateToDraw,
    navigateToTenantInDraw,
    navigateToPlayer,
    navigateToTenantDrills,
  };
}
