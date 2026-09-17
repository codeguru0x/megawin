"use client";

import type { ReactNode } from "react";

import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

import { DATA_HOVER_SURFACE_CLASS } from "./hover-surface-class";
import type { NumberHeatmapHovered, NumberHeatmapHoverItem } from "./use-number-heatmap-hover";

const SIDE_OFFSET = 6;
const PANEL_ESTIMATE_HEIGHT = 88;

/**
 * Một portal Data Hover Surface cho cả grid — position fixed theo rect ô đang hover.
 * Flip xuống nếu thiếu chỗ phía trên viewport.
 *
 * `key={item.number}` bắt buộc: mỗi lần chuyển sang ô khác là 1 mount mới → animation
 * `animate-in` (CSS keyframe, chỉ chạy lúc mount) luôn được re-trigger, khớp với cách
 * `skipDelayDuration` của Radix Tooltip vẫn fade lại (chỉ bỏ delay, không bỏ animation).
 *
 * TÁCH 2 LỚP positioning / animation — bắt buộc, không gộp `transform` vào 1 div:
 * CSS animation (`zoom-in-95` set `transform: scale3d(...)` qua keyframe) LUÔN thắng
 * `style.transform` khai báo tĩnh trên cùng property, suốt thời gian chạy animation.
 * Nếu gộp chung, phần `translate(-50%, ...)` để canh giữa panel theo ô hover bị animation
 * đè mất → panel mount lệch vị trí rồi mới "nhảy" vào đúng chỗ (đúng hiện tượng đã gặp).
 * Div ngoài (`transform: translate(-50%, ...)`) chỉ lo vị trí; div trong (`animate-in`)
 * chỉ lo scale/fade — `transform-origin` mặc định (center) của div trong khi đó trùng
 * đúng tâm điểm đã canh sẵn → panel "mọc" từ đúng ô đang hover.
 */
export function NumberHeatmapHoverLayer<T extends NumberHeatmapHoverItem>({
  hovered,
  children,
}: {
  hovered: NumberHeatmapHovered<T> | null;
  children: (item: T) => ReactNode;
}) {
  if (!hovered || typeof document === "undefined") {
    return null;
  }

  const { item, rect } = hovered;
  const spaceAbove = rect.top - SIDE_OFFSET;
  const placeBelow = spaceAbove < PANEL_ESTIMATE_HEIGHT;
  const left = rect.left + rect.width / 2;
  const top = placeBelow ? rect.bottom + SIDE_OFFSET : rect.top - SIDE_OFFSET;

  return createPortal(
    // Div ngoài — CHỈ positioning, không animation, không style khác. Giữ transform
    // canh giữa ổn định trong suốt vòng đời panel.
    <div
      key={item.number}
      className="pointer-events-none fixed z-50"
      style={{
        left,
        top,
        transform: placeBelow ? "translate(-50%, 0)" : "translate(-50%, -100%)",
      }}
    >
      {/* Div trong — CHỈ animation (scale/fade), transform-origin mặc định = center
          trùng đúng tâm điểm đã canh ở div ngoài → mọc từ đúng ô hover. */}
      <div
        role="tooltip"
        data-slot="number-heatmap-hover-surface"
        className={cn(DATA_HOVER_SURFACE_CLASS, "fade-in-0 zoom-in-95 animate-in w-fit duration-100 ease-out")}
      >
        {children(item)}
      </div>
    </div>,
    document.body,
  );
}
