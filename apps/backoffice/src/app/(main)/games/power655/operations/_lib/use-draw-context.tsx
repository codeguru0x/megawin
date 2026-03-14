"use client";

/**
 * Power 6/55 Operations — Draw Selection Context
 *
 * Cung cấp draw đang được chọn và opsParams cho toàn trang operations.
 * Dùng React Context để tránh prop drilling qua nhiều layer component.
 *
 * Power 6/55: 3 kỳ/tuần (thứ 3, 5, 7), drawNo = 1 cố định.
 */

import { createContext, useContext, useCallback, type ReactNode } from "react";
import { useQueryState } from "nuqs";
import { DrawStatus } from "@megawin/game-core/entities";
import {
  useDrawSelectorList,
  useDrawDetail,
  type DrawSelectorItem,
  type OpsQueryParams,
} from "./use-operations";

// ─── Context shape ────────────────────────────────────────────────────────────

interface DrawContextValue {
  draws: DrawSelectorItem[];
  draw: DrawSelectorItem | undefined;
  effectiveDrawId: string;
  opsParams: OpsQueryParams;
  isSettled: boolean;
  isVoided: boolean;
  isActiveForRefresh: boolean;
  drawNotFound: boolean;
  noDrawAvailable: boolean;
  isHistorical: boolean;
  onSelectDraw: (drawId: string) => void;
}

const DrawContext = createContext<DrawContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function DrawContextProvider({ children }: { children: ReactNode }) {
  // nuqs đồng bộ 2 chiều: chọn draw → cập nhật URL, refresh → đọc lại URL
  const [selectedDrawId, setSelectedDrawId] = useQueryState("draw", { defaultValue: "" });

  const { data: selectorData, isLoading: selectorLoading } = useDrawSelectorList();
  const draws = selectorData?.draws ?? [];

  const selectedInList = selectedDrawId ? draws.some((d) => d.drawId === selectedDrawId) : false;

  // Auto-select kỳ active nếu không có selectedDrawId
  const effectiveDrawId =
    selectedDrawId || draws.find((d) => d.group === "active")?.drawId || draws[0]?.drawId || "";

  const {
    data: remoteDrawData,
    isLoading: remoteLoading,
    isError: remoteError,
  } = useDrawDetail(effectiveDrawId || undefined);

  const remoteDraw = remoteDrawData?.draw;

  const isHistorical =
    !!selectedDrawId && !selectorLoading && draws.length > 0 && !selectedInList && !!remoteDraw;

  const drawNotFound =
    !!selectedDrawId &&
    !selectorLoading &&
    !selectedInList &&
    !remoteLoading &&
    (remoteError || !remoteDraw);

  const noDrawAvailable = !selectedDrawId && !selectorLoading && draws.length === 0;

  const drawFromSelector = draws.find((d) => d.drawId === effectiveDrawId);
  const drawFromRemote: DrawSelectorItem | undefined =
    !drawFromSelector && remoteDraw
      ? {
          drawId: remoteDraw.drawId,
          // Power 6/55: drawNo luôn = 1
          drawNo: 1,
          drawDate: remoteDraw.drawDate.split("-").reverse().join("/"),
          drawTime: remoteDraw.drawTime as unknown as string,
          salesOpenAt: remoteDraw.sales?.openAt as unknown as string | undefined,
          salesCloseAt: (remoteDraw.sales?.closeAt as unknown as string) ?? "",
          drawResultAt: remoteDraw.result?.publishedAt as unknown as string | undefined,
          status: remoteDraw.status,
          financialDate: remoteDraw.financialDate ?? remoteDraw.drawDate,
          group: "recent" as const,
        }
      : undefined;
  const draw = drawFromSelector ?? drawFromRemote;

  const status = draw?.status ?? remoteDraw?.status;
  const isSettled = status === DrawStatus.Settled;
  const isVoided = status === DrawStatus.Void || status === DrawStatus.Voiding;
  const isActiveForRefresh = !isHistorical && draw?.group === "active" && !isSettled;

  const opsParams: OpsQueryParams = {
    drawId: effectiveDrawId,
    financialDate: draw?.financialDate ?? remoteDraw?.financialDate ?? remoteDraw?.drawDate,
  };

  const onSelectDraw = useCallback(
    (drawId: string) => {
      // Khi chọn active draw → xoá param khỏi URL để giữ URL gọn
      const activeDrawId = draws.find((d) => d.group === "active")?.drawId || draws[0]?.drawId;
      setSelectedDrawId(drawId === activeDrawId ? null : drawId);
    },
    [draws, setSelectedDrawId],
  );

  const value: DrawContextValue = {
    draws,
    draw,
    effectiveDrawId,
    opsParams,
    isSettled,
    isVoided,
    isActiveForRefresh,
    drawNotFound: !!drawNotFound,
    noDrawAvailable,
    isHistorical,
    onSelectDraw,
  };

  return <DrawContext.Provider value={value}>{children}</DrawContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDrawContext() {
  const ctx = useContext(DrawContext);
  if (!ctx) throw new Error("useDrawContext must be used within DrawContextProvider");
  return ctx;
}
