"use client";

/**
 * Lotto 5/35 Operations — Draw Selection Context
 *
 * Cung cấp draw đang được chọn và opsParams cho toàn trang operations.
 * Dùng React Context để tránh prop drilling qua nhiều layer component.
 *
 * Logic:
 *  - Luôn fetch draw detail qua useDrawDetail (dù draw có trong selector hay không).
 *  - Selector dropdown chỉ tick chọn nếu drawId có trong danh sách mặc định.
 *  - Kỳ không trong selector → isHistorical = true, thông tin hiển thị trực tiếp ở page.
 *  - Draw không tồn tại trong DB → drawNotFound = true, page hiển thị "Not Found".
 *
 * Auto-refresh được uỷ quyền hoàn toàn cho React Query (refetchInterval trên từng query).
 */

import { createContext, type ReactNode, useCallback, useContext } from "react";

import { DrawSelectorGroup, DrawStatus } from "@megawin/game-core/entities";
import { useQueryState } from "nuqs";

import { type DrawSelectorItem, type OpsQueryParams, useDrawDetail, useDrawSelectorList } from "./use-operations";

// ─── Context shape ────────────────────────────────────────────────────────────

interface DrawContextValue {
  /** Danh sách tất cả draws từ selector. */
  draws: DrawSelectorItem[];
  /** Draw đang được chọn hiệu lực (item từ selector, hoặc undefined nếu là kỳ cũ). */
  draw: DrawSelectorItem | undefined;
  /** Draw ID hiệu lực (sau khi auto-select). */
  effectiveDrawId: string;
  /** Params cho các analytics queries. */
  opsParams: OpsQueryParams;
  /** Trạng thái kỳ hiện chọn (`draw.status` — có thể undefined khi chưa xác định được draw). */
  status: DrawStatus | undefined;
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
  const [selectedDrawId, setSelectedDrawId] = useQueryState("draw", { defaultValue: "" });

  const { data: selectorData, isLoading: selectorLoading } = useDrawSelectorList();
  const draws = selectorData?.draws ?? [];

  const selectedInList = selectedDrawId ? draws.some((d) => d.drawId === selectedDrawId) : false;

  // Auto-select kỳ active nếu không có selectedDrawId
  const effectiveDrawId =
    selectedDrawId || draws.find((d) => d.group === DrawSelectorGroup.Active)?.drawId || draws[0]?.drawId || "";

  // Luôn fetch draw detail cho effectiveDrawId — dù trong list hay kỳ cũ
  const {
    data: remoteDrawData,
    isLoading: remoteLoading,
    isError: remoteError,
  } = useDrawDetail(effectiveDrawId || undefined);

  const remoteDraw = remoteDrawData?.draw;

  // Kỳ cũ: selectedDrawId có giá trị, không trong list, và selector đã load xong
  const isHistorical = !!selectedDrawId && !selectorLoading && draws.length > 0 && !selectedInList && !!remoteDraw;

  // Không tồn tại trong DB: URL có ?draw=xxx, selector đã load xong,
  // draw không có trong list VÀ detail cũng không tìm thấy (error hoặc null).
  // Bỏ điều kiện draws.length > 0 vì kể cả khi list rỗng, nếu detail không có
  // thì vẫn phải hiển thị DrawNotFound.
  const drawNotFound =
    !!selectedDrawId && !selectorLoading && !selectedInList && !remoteLoading && (remoteError || !remoteDraw);

  // Chưa có kỳ nào: không có ?draw param, selector đã load xong nhưng list rỗng.
  // Phân biệt với drawNotFound (có param nhưng không tìm thấy).
  const noDrawAvailable = !selectedDrawId && !selectorLoading && draws.length === 0;
  // Các section luôn cần draw có giá trị để render — selector tick logic độc lập (selectedInList).
  const drawFromSelector = draws.find((d) => d.drawId === effectiveDrawId);
  const drawFromRemote: DrawSelectorItem | undefined =
    !drawFromSelector && remoteDraw
      ? {
          drawId: remoteDraw.drawId,
          drawNo: remoteDraw.drawNo as 1 | 2,
          drawDate: remoteDraw.drawDate.split("-").reverse().join("/"),
          drawTime: remoteDraw.drawTime,
          salesOpenAt: remoteDraw.sales?.openAt,
          salesCloseAt: remoteDraw.sales?.closeAt ?? "",
          // drawTime = giờ quay theo lịch, luôn có — cấp cho countdown/overdue-publish.
          scheduledDrawAt: remoteDraw.drawTime,
          drawResultAt: remoteDraw.result?.publishedAt,
          status: remoteDraw.status,
          financialDate: remoteDraw.financialDate ?? remoteDraw.drawDate,
          group: DrawSelectorGroup.Recent,
          // High-water mark — BẮT BUỘC có để nút "Kết sổ lại" hiển thị đúng
          // cho kỳ historical (không nằm trong selector list).
          settledAt: remoteDraw.settledAt,
        }
      : undefined;
  const draw = drawFromSelector ?? drawFromRemote;

  // Status lấy từ draw selector nếu có, fallback từ remoteDraw
  const status = draw?.status ?? remoteDraw?.status;
  const isSettled = status === DrawStatus.Settled;
  const isVoided = status === DrawStatus.Void || status === DrawStatus.Voiding;
  const isActiveForRefresh = !isHistorical && draw?.group === DrawSelectorGroup.Active && !isSettled;

  const opsParams: OpsQueryParams = {
    drawId: effectiveDrawId,
    financialDate: draw?.financialDate ?? remoteDraw?.financialDate ?? remoteDraw?.drawDate,
  };

  const onSelectDraw = useCallback(
    (drawId: string) => {
      // Khi chọn active draw → xoá param khỏi URL để giữ URL gọn
      const activeDrawId = draws.find((d) => d.group === DrawSelectorGroup.Active)?.drawId || draws[0]?.drawId;
      setSelectedDrawId(drawId === activeDrawId ? null : drawId);
    },
    [draws, setSelectedDrawId],
  );

  const value: DrawContextValue = {
    draws,
    draw,
    effectiveDrawId,
    opsParams,
    status,
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
