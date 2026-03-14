"use client";

/**
 * Bingo 18 Operations — Draw Selection Context
 *
 * Cung cấp draw đang được chọn và opsParams cho toàn trang operations.
 * Bingo 18: ~160 kỳ/ngày (~6 phút/kỳ) → group active/upcoming/recent.
 * drawNo có ý nghĩa — dùng kết hợp với drawDate để hiển thị.
 *
 * Auto-select: ưu tiên kỳ đang active, fallback kỳ upcoming đầu tiên.
 */

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { DrawStatus } from "@megawin/game-core/entities";
import {
  useDrawSelectorList,
  useDrawDetail,
  type DrawSelectorItem,
  type OpsQueryParams,
} from "./use-operations";

// ─── Context shape ─────────────────────────────────────────────────────────

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

// ─── Provider ──────────────────────────────────────────────────────────────

export function DrawContextProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const urlDrawId = searchParams.get("draw") ?? "";
  const [selectedDrawId, setSelectedDrawId] = useState<string>(urlDrawId);

  const { data: selectorData, isLoading: selectorLoading } = useDrawSelectorList();
  const draws = selectorData?.draws ?? [];

  // Sync URL param → state
  useEffect(() => {
    if (urlDrawId) setSelectedDrawId(urlDrawId);
  }, [urlDrawId]);

  const selectedInList = selectedDrawId
    ? draws.some((d: DrawSelectorItem) => d.drawId === selectedDrawId)
    : false;

  // Auto-select: kỳ active trước, sau đó upcoming, cuối cùng kỳ đầu tiên trong list
  const effectiveDrawId =
    selectedDrawId ||
    draws.find((d: DrawSelectorItem) => d.group === "active")?.drawId ||
    draws.find((d: DrawSelectorItem) => d.group === "upcoming")?.drawId ||
    draws[0]?.drawId ||
    "";

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

  const drawFromSelector = draws.find((d: DrawSelectorItem) => d.drawId === effectiveDrawId);
  const drawFromRemote: DrawSelectorItem | undefined =
    !drawFromSelector && remoteDraw
      ? {
          drawId: remoteDraw.drawId,
          drawNo: remoteDraw.drawNo,
          drawDate: remoteDraw.drawDate.split("-").reverse().join("/"),
          drawTime: remoteDraw.drawTime as unknown as string,
          salesOpenAt: remoteDraw.sales?.openAt as unknown as string | undefined,
          salesCloseAt: (remoteDraw.sales?.closeAt as unknown as string) ?? "",
          scheduledDrawAt: new Date(remoteDraw.drawTime as unknown as string).toISOString(),
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

  const onSelectDraw = useCallback((drawId: string) => {
    setSelectedDrawId(drawId);
  }, []);

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

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useDrawContext() {
  const ctx = useContext(DrawContext);
  if (!ctx) throw new Error("useDrawContext must be used within DrawContextProvider");
  return ctx;
}
