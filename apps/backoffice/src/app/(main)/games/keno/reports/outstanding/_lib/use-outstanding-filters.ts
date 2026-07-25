"use client";

import { useCallback } from "react";

import { parseAsString, useQueryState } from "nuqs";

import type { OutstandingDrillLevel } from "@/components/reports/game/outstanding";

/** URL state hook cho Keno Outstanding page. */
export function useKenoOutstandingFilters() {
  const [drawId, setDrawId] = useQueryState("draw", parseAsString);
  const [tenantId, setTenantId] = useQueryState("tenant", parseAsString);
  const [playerId, setPlayerId] = useQueryState("player", parseAsString);
  // playerName lưu username để hiển thị trong breadcrumb/card title
  const [playerName, setPlayerName] = useQueryState("playerName", parseAsString);

  // DrillLevel tính TỰ ĐỘNG từ URL — không lưu state riêng
  const level: OutstandingDrillLevel = playerId
    ? "entries"
    : tenantId && drawId
      ? "players"
      : drawId
        ? "draw-tenants"
        : "list";

  /** Về Level 1 — xóa toàn bộ drill params. */
  const navigateToList = useCallback(() => {
    void setDrawId(null);
    void setTenantId(null);
    void setPlayerId(null);
    void setPlayerName(null);
  }, [setDrawId, setTenantId, setPlayerId, setPlayerName]);

  /** Drill vào Level 2 — giữ drawId, xóa tenant + player. */
  const navigateToDraw = useCallback(
    (id: string) => {
      void setDrawId(id, { history: "push" });
      void setTenantId(null);
      void setPlayerId(null);
      void setPlayerName(null);
    },
    [setDrawId, setTenantId, setPlayerId, setPlayerName],
  );

  /** Drill vào Level 3 — giữ drawId + tenantId, xóa player. */
  const navigateToTenant = useCallback(
    (id: string) => {
      void setTenantId(id, { history: "push" });
      void setPlayerId(null);
      void setPlayerName(null);
    },
    [setTenantId, setPlayerId, setPlayerName],
  );

  /**
   * Drill vào Level 4 — set accountId + username (để breadcrumb/header dùng).
   * @param id        - accountId
   * @param username  - display name, fallback về accountId nếu trống
   */
  const navigateToPlayer = useCallback(
    (id: string, username?: string) => {
      void setPlayerId(id, { history: "push" });
      void setPlayerName(username ?? null);
    },
    [setPlayerId, setPlayerName],
  );

  return {
    drawId,
    tenantId,
    playerId,
    /** Username của player đang drill vào — dùng cho breadcrumb/card title. */
    playerName,
    level,
    navigateToList,
    navigateToDraw,
    navigateToTenant,
    navigateToPlayer,
  };
}
