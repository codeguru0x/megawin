"use client";

import { useQueryState, parseAsString } from "nuqs";
import { useCallback } from "react";
import { todayVN, formatVNDate } from "@megawin/shared/utils";
import { subDays } from "date-fns";
import { TZDate, VN_TIMEZONE } from "@megawin/shared/utils";

import type { VoidDrillLevel } from "@/components/reports/game/void";

/** URL state hook cho Power 6/55 Void Reports page. */
export function usePower655VoidFilters() {
  const today = todayVN();
  const sevenDaysAgo = formatVNDate(subDays(new TZDate(new Date(), VN_TIMEZONE), 6));

  const [from, setFrom] = useQueryState("from", parseAsString.withDefault(sevenDaysAgo));
  const [to, setTo] = useQueryState("to", parseAsString.withDefault(today));
  const [drawId, setDrawId] = useQueryState("draw", parseAsString);
  const [tenantId, setTenantId] = useQueryState("tenant", parseAsString);
  const [playerId, setPlayerId] = useQueryState("player", parseAsString);
  const [playerName, setPlayerName] = useQueryState("playerName", parseAsString);

  const level: VoidDrillLevel = playerId
    ? "entries"
    : tenantId && drawId
      ? "players"
      : drawId
        ? "draw-tenants"
        : "list";

  const navigateToList = useCallback(() => {
    void setDrawId(null);
    void setTenantId(null);
    void setPlayerId(null);
    void setPlayerName(null);
  }, [setDrawId, setTenantId, setPlayerId, setPlayerName]);

  const navigateToDraw = useCallback(
    (id: string) => {
      void setDrawId(id, { history: "push" });
      void setTenantId(null);
      void setPlayerId(null);
      void setPlayerName(null);
    },
    [setDrawId, setTenantId, setPlayerId, setPlayerName],
  );

  const navigateToTenant = useCallback(
    (id: string) => {
      void setTenantId(id, { history: "push" });
      void setPlayerId(null);
      void setPlayerName(null);
    },
    [setTenantId, setPlayerId, setPlayerName],
  );

  const navigateToPlayer = useCallback(
    (id: string, username?: string) => {
      void setPlayerId(id, { history: "push" });
      void setPlayerName(username ?? null);
    },
    [setPlayerId, setPlayerName],
  );

  const onDateChange = useCallback(
    (f: string, t: string) => {
      void setFrom(f);
      void setTo(t);
      void setDrawId(null);
      void setTenantId(null);
      void setPlayerId(null);
      void setPlayerName(null);
    },
    [setFrom, setTo, setDrawId, setTenantId, setPlayerId, setPlayerName],
  );

  return {
    from,
    to,
    onDateChange,
    drawId,
    tenantId,
    playerId,
    playerName,
    level,
    navigateToList,
    navigateToDraw,
    navigateToTenant,
    navigateToPlayer,
  };
}
