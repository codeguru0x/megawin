"use client";

/**
 * Keno Operations — Draw Selection Context
 *
 * Cung cấp draw đang được chọn và opsParams cho toàn trang operations.
 * Keno khác Mega 6/45: nhiều kỳ/ngày (~120) → group active/future/recent.
 * drawNo có ý nghĩa (001-120) — dùng kết hợp với drawDate để hiển thị.
 *
 * Auto-select: ưu tiên kỳ đang active, fallback kỳ future đầu tiên.
 */

import { createContext, useContext, useCallback, type ReactNode } from "react";
import { useQueryState } from "nuqs";
import { DrawStatus, DrawSelectorGroup } from "@megawin/game-core/entities";
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

  // Auto-select: kỳ active trước, sau đó future, cuối cùng bất kỳ kỳ đầu tiên
  const effectiveDrawId =
    selectedDrawId ||
    draws.find((d) => d.group === DrawSelectorGroup.Active)?.drawId ||
    draws.find((d) => d.group === DrawSelectorGroup.Future)?.drawId ||
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

  const drawFromSelector = draws.find((d) => d.drawId === effectiveDrawId);
  const drawFromRemote: DrawSelectorItem | undefined =
    !drawFromSelector && remoteDraw
      ? {
          drawId: remoteDraw.drawId,
          drawNo: remoteDraw.drawNo,
          drawDate: remoteDraw.drawDate.split("-").reverse().join("/"),
          drawTime: remoteDraw.drawTime,
          salesOpenAt: remoteDraw.sales?.openAt,
          salesCloseAt: remoteDraw.sales?.closeAt ?? "",
          // drawTime luôn có — giờ quay theo lịch, dùng cho countdown/overdue-publish.
          scheduledDrawAt: remoteDraw.drawTime,
          drawResultAt: remoteDraw.result?.publishedAt,
          // settledAt là high-water mark — bắt buộc map từ remote để UI phân biệt
          // "Kết sổ" (chưa từng settle) vs "Kết sổ lại" (đã settle, republish kết quả).
          // Thiếu field này → canVoid = true (Hủy kỳ hiện sai) + Resettle không hiện.
          settledAt: remoteDraw.settledAt,
          status: remoteDraw.status,
          financialDate: remoteDraw.financialDate,
          group: DrawSelectorGroup.Recent,
        }
      : undefined;
  const draw = drawFromSelector ?? drawFromRemote;

  const status = draw?.status ?? remoteDraw?.status;
  const isSettled = status === DrawStatus.Settled;
  const isVoided = status === DrawStatus.Void || status === DrawStatus.Voiding;
  const isActiveForRefresh =
    !isHistorical && draw?.group === DrawSelectorGroup.Active && !isSettled;

  const opsParams: OpsQueryParams = {
    drawId: effectiveDrawId,
    financialDate: draw?.financialDate ?? remoteDraw?.financialDate ?? remoteDraw?.drawDate,
  };

  const onSelectDraw = useCallback(
    (drawId: string) => {
      // Khi chọn active draw (hoặc clear selection) → xoá param khỏi URL để giữ URL gọn
      const activeDrawId =
        draws.find((d) => d.group === DrawSelectorGroup.Active)?.drawId ||
        draws.find((d) => d.group === DrawSelectorGroup.Future)?.drawId ||
        draws[0]?.drawId;
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
