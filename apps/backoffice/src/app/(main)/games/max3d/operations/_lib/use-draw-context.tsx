"use client";

/**
 * Max 3D Operations — Draw Selection Context
 *
 * Cung cấp draw đang được chọn và opsParams cho toàn trang operations.
 * Dùng React Context để tránh prop drilling qua nhiều layer component.
 *
 * Logic:
 *  - Luôn fetch draw detail qua useDrawDetail (dù draw có trong selector hay không).
 *  - Selector dropdown chỉ tick chọn nếu drawId có trong danh sách mặc định.
 *  - Kỳ không trong selector → isHistorical = true, thông tin hiển thị trực tiếp ở page.
 *  - Draw không tồn tại trong DB → drawNotFound = true, page hiển thị "Not Found".
 */

import { createContext, type ReactNode, useCallback, useContext } from "react";

import { DrawSelectorGroup, DrawStatus } from "@megawin/game-core/entities";
import { useQueryState } from "nuqs";

import { useAiPageContext } from "@/hooks/use-ai-page-context";

import { type DrawSelectorItem, useDrawDetail, useDrawSelectorList } from "./use-operations";

// ─── Context shape ────────────────────────────────────────────────────────────

interface DrawContextValue {
  /** Danh sách tất cả draws từ selector. */
  draws: DrawSelectorItem[];
  /** Draw đang được chọn hiệu lực (item từ selector, hoặc undefined nếu là kỳ cũ). */
  draw: DrawSelectorItem | undefined;
  /** Draw ID hiệu lực (sau khi auto-select). */
  effectiveDrawId: string;
  /** Kỳ đã settle. */
  isSettled: boolean;
  /** Kỳ đã void. */
  isVoided: boolean;
  /** Kỳ cần auto refresh (active, chưa settle). */
  isActiveForRefresh: boolean;
  /** URL yêu cầu kỳ cụ thể nhưng không tìm thấy trong hệ thống. */
  drawNotFound: boolean;
  /** Selector đã load xong nhưng không có kỳ nào để hiển thị (chưa tạo kỳ). */
  noDrawAvailable: boolean;
  /** Kỳ đang chọn là kỳ cũ (không có trong dropdown selector). */
  isHistorical: boolean;
  /** Hàm chọn draw. */
  onSelectDraw: (drawId: string) => void;
}

const DrawContext = createContext<DrawContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function DrawContextProvider({ children }: { children: ReactNode }) {
  // nuqs đồng bộ 2 chiều: chọn draw → cập nhật URL, refresh → đọc lại URL
  const [selectedDrawId, setSelectedDrawId] = useQueryState("drawId", { defaultValue: "" });

  const { data: selectorData, isLoading: selectorLoading } = useDrawSelectorList();
  const draws = selectorData?.draws ?? [];

  const selectedInList = selectedDrawId ? draws.some((d: DrawSelectorItem) => d.drawId === selectedDrawId) : false;

  // Auto-select kỳ active nếu không có selectedDrawId
  const effectiveDrawId =
    selectedDrawId ||
    draws.find((d: DrawSelectorItem) => d.group === DrawSelectorGroup.Active)?.drawId ||
    draws[0]?.drawId ||
    "";

  // Luôn fetch draw detail cho effectiveDrawId — dù trong list hay kỳ cũ
  const {
    data: remoteDrawData,
    isLoading: remoteLoading,
    isError: remoteError,
  } = useDrawDetail(effectiveDrawId || undefined);

  const remoteDraw = remoteDrawData?.draw;

  // Kỳ cũ: selectedDrawId có giá trị, không trong list, và selector đã load xong
  const isHistorical = !!selectedDrawId && !selectorLoading && draws.length > 0 && !selectedInList && !!remoteDraw;

  const drawNotFound =
    !!selectedDrawId && !selectorLoading && !selectedInList && !remoteLoading && (remoteError || !remoteDraw);

  // Chưa có kỳ nào: không có ?draw param, selector đã load xong nhưng list rỗng.
  const noDrawAvailable = !selectedDrawId && !selectorLoading && draws.length === 0;

  const drawFromSelector = draws.find((d: DrawSelectorItem) => d.drawId === effectiveDrawId);
  const drawFromRemote: DrawSelectorItem | undefined =
    !drawFromSelector && remoteDraw
      ? {
          drawId: remoteDraw.drawId,
          drawNo: remoteDraw.drawNo as 1,
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
  const isActiveForRefresh = !isHistorical && draw?.group === DrawSelectorGroup.Active && !isSettled;

  const onSelectDraw = useCallback(
    (drawId: string) => {
      // Khi chọn active draw → xoá param khỏi URL để giữ URL gọn
      const activeDrawId =
        draws.find((d: DrawSelectorItem) => d.group === DrawSelectorGroup.Active)?.drawId || draws[0]?.drawId;
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

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDrawContext() {
  const ctx = useContext(DrawContext);
  if (!ctx) throw new Error("useDrawContext must be used within DrawContextProvider");
  return ctx;
}
