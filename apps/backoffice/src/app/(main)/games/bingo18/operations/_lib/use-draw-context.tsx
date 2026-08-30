"use client";

/**
 * Bingo 18 Operations — Draw Selection Context
 *
 * Cung cấp draw đang được chọn cho toàn trang operations.
 * Bingo 18: ~158 kỳ/ngày (~6 phút/kỳ) → group active/future/recent.
 * drawNo có ý nghĩa — dùng kết hợp với drawDate để hiển thị.
 *
 * Auto-select: ưu tiên kỳ đang active, fallback kỳ future đầu tiên.
 */

import { createContext, type ReactNode, useCallback, useContext } from "react";

import { DrawSelectorGroup, DrawStatus } from "@megawin/game-core/entities";
import { useQueryState } from "nuqs";

import { useAiPageContext } from "@/hooks/use-ai-page-context";

import { type DrawSelectorItem, useDrawDetail, useDrawSelectorList } from "./use-operations";

// ─── Context shape ─────────────────────────────────────────────────────────

interface DrawContextValue {
  draws: DrawSelectorItem[];
  draw: DrawSelectorItem | undefined;
  effectiveDrawId: string;
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
  // nuqs đồng bộ 2 chiều: chọn draw → cập nhật URL, refresh → đọc lại URL
  const [selectedDrawId, setSelectedDrawId] = useQueryState("drawId", { defaultValue: "" });

  const { data: selectorData, isLoading: selectorLoading } = useDrawSelectorList();
  const draws = selectorData?.draws ?? [];

  const selectedInList = selectedDrawId ? draws.some((d: DrawSelectorItem) => d.drawId === selectedDrawId) : false;

  // Auto-select: kỳ active trước, sau đó future, cuối cùng kỳ đầu tiên trong list
  const effectiveDrawId =
    selectedDrawId ||
    draws.find((d: DrawSelectorItem) => d.group === DrawSelectorGroup.Active)?.drawId ||
    draws.find((d: DrawSelectorItem) => d.group === DrawSelectorGroup.Future)?.drawId ||
    draws[0]?.drawId ||
    "";

  const {
    data: remoteDrawData,
    isLoading: remoteLoading,
    isError: remoteError,
  } = useDrawDetail(effectiveDrawId || undefined);

  const remoteDraw = remoteDrawData?.draw;

  const isHistorical = !!selectedDrawId && !selectorLoading && draws.length > 0 && !selectedInList && !!remoteDraw;

  const drawNotFound =
    !!selectedDrawId && !selectorLoading && !selectedInList && !remoteLoading && (remoteError || !remoteDraw);

  const noDrawAvailable = !selectedDrawId && !selectorLoading && draws.length === 0;

  const drawFromSelector = draws.find((d: DrawSelectorItem) => d.drawId === effectiveDrawId);
  const drawFromRemote: DrawSelectorItem | undefined =
    !drawFromSelector && remoteDraw
      ? {
          drawId: remoteDraw.drawId,
          drawNo: remoteDraw.drawNo,
          drawDate: remoteDraw.drawDate.split("-").reverse().join("/"),
          drawTime: remoteDraw.drawTime,
          salesOpenAt: remoteDraw.sales?.openAt,
          salesCloseAt: remoteDraw.sales?.closeAt ?? "",
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
  const isActiveForRefresh = !isHistorical && draw?.group === DrawSelectorGroup.Active && !isSettled;

  const onSelectDraw = useCallback(
    (drawId: string) => {
      // Khi chọn active draw (hoặc clear selection) → xoá param khỏi URL để giữ URL gọn
      const activeDrawId =
        draws.find((d: DrawSelectorItem) => d.group === DrawSelectorGroup.Active)?.drawId ||
        draws.find((d: DrawSelectorItem) => d.group === DrawSelectorGroup.Future)?.drawId ||
        draws[0]?.drawId;
      setSelectedDrawId(drawId === activeDrawId ? null : drawId);
    },
    [draws, setSelectedDrawId],
  );

  // Công bố kỳ đang xem cho AI Panel. BẮT BUỘC phải publish ở đây: `onSelectDraw` bên trên xoá
  // `?drawId=` khỏi URL khi staff xem kỳ đang hoạt động (giữ URL gọn), nên `clientContext.filters`
  // (đọc từ URL) KHÔNG chứa kỳ này ⇒ model không biết staff đang hỏi về kỳ nào.
  // Hook không gây re-render — chỉ ghi hàm đọc vào store, provider đọc lúc bấm Gửi.
  useAiPageContext("operations", {
    drawId: effectiveDrawId,
    drawStatus: status,
    financialDate: draw?.financialDate,
    // Chỉ gửi khi true — `false` mỗi turn chỉ làm nhiễu prompt.
    isHistoricalDraw: isHistorical || undefined,
  });

  const value: DrawContextValue = {
    draws,
    draw,
    effectiveDrawId,
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
