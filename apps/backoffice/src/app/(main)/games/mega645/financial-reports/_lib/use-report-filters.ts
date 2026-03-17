"use client";

import { useQueryState, parseAsString, parseAsStringLiteral } from "nuqs";
import { useCallback } from "react";
import { todayVN } from "@megawin/shared/utils/date";

const TABS = ["draws", "tenants"] as const;

export type DrillLevel = "list" | "draw-tenants" | "players" | "entries" | "tenant-draws";

/** URL state hook cho Mega 6/45 Financial Reports page. */
export function useMega645ReportFilters() {
  const today = todayVN();
  const [tab, setTabRaw] = useQueryState("tab", parseAsStringLiteral(TABS).withDefault("draws"));
  const [from, setFrom] = useQueryState("from", parseAsString.withDefault(today));
  const [to, setTo] = useQueryState("to", parseAsString.withDefault(today));
  const [drawId, setDrawId] = useQueryState("draw", parseAsString);
  const [tenantId, setTenantId] = useQueryState("tenant", parseAsString);
  // playerId = accountId, playerName = username để hiển thị trên breadcrumb
  const [playerId, setPlayerId] = useQueryState("player", parseAsString);
  const [playerName, setPlayerName] = useQueryState("playerName", parseAsString);

  const level: DrillLevel = playerId
    ? "entries"
    : tenantId && drawId
      ? "players"
      : drawId
        ? "draw-tenants"
        : tenantId
          ? "tenant-draws"
          : "list";

  // Chuyển tab phải clear hết drill params, dùng push để tạo history entry.
  const setTab = useCallback(
    (t: "draws" | "tenants") => {
      void setTabRaw(t, { history: "push" });
      void setDrawId(null);
      void setTenantId(null);
      void setPlayerId(null);
      void setPlayerName(null);
    },
    [setTabRaw, setDrawId, setTenantId, setPlayerId, setPlayerName],
  );

  // navigateToList: về cấp 1, tạo history entry để Back hoạt động.
  const navigateToList = useCallback(() => {
    void setDrawId(null, { history: "push" });
    void setTenantId(null);
    void setPlayerId(null);
    void setPlayerName(null);
  }, [setDrawId, setTenantId, setPlayerId, setPlayerName]);

  // navigateToDraw: drill vào draw, tạo history entry.
  const navigateToDraw = useCallback(
    (id: string) => {
      void setDrawId(id, { history: "push" });
      void setTenantId(null);
      void setPlayerId(null);
      void setPlayerName(null);
    },
    [setDrawId, setTenantId, setPlayerId, setPlayerName],
  );

  // navigateToTenantInDraw: drill vào tenant trong draw, tạo history entry.
  const navigateToTenantInDraw = useCallback(
    (id: string) => {
      void setTenantId(id, { history: "push" });
      void setPlayerId(null);
      void setPlayerName(null);
    },
    [setTenantId, setPlayerId, setPlayerName],
  );

  // navigateToPlayer: drill vào player, lưu kèm username để breadcrumb hiển thị tên.
  const navigateToPlayer = useCallback(
    (id: string, name?: string) => {
      void setPlayerId(id, { history: "push" });
      void setPlayerName(name ?? null);
    },
    [setPlayerId, setPlayerName],
  );

  /** Tab "Theo đại lý": chọn tenant → drill vào danh sách kỳ quay của tenant. */
  const navigateToTenantDrills = useCallback(
    (id: string) => {
      void setTenantId(id, { history: "push" });
      void setDrawId(null);
      void setPlayerId(null);
      void setPlayerName(null);
    },
    [setTenantId, setDrawId, setPlayerId, setPlayerName],
  );

  /**
   * Tab "Theo đại lý" > TenantDrawList: click 1 draw → drill tiếp (players).
   * Giữ nguyên tab "tenants", KHÔNG chuyển sang tab "draws".
   */
  const navigateToDrawInTenant = useCallback(
    (dId: string, tId: string) => {
      void setDrawId(dId, { history: "push" });
      void setTenantId(tId);
      void setPlayerId(null);
      void setPlayerName(null);
    },
    [setDrawId, setTenantId, setPlayerId, setPlayerName],
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
