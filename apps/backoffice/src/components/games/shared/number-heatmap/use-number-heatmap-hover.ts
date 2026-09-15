"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Payload tối thiểu cho cell detail — khớp NumberFreqItem của 4 game. */
export interface NumberHeatmapHoverItem {
  number: string;
  sets: number;
  amount: number;
}

export interface NumberHeatmapHovered<T extends NumberHeatmapHoverItem = NumberHeatmapHoverItem> {
  item: T;
  rect: DOMRect;
}

const OPEN_DELAY_MS = 150;
const CLOSE_DELAY_MS = 100;

/**
 * Shared hover state cho number-heatmap grid — O(1) panel thay vì N Radix Tooltip.
 *
 * - `onCellEnter` / `onCellLeave`: gắn lên từng ô (pointer + focus).
 * - Open delay 150ms CHỈ áp dụng cho lần hover đầu tiên (giống Radix `skipDelayDuration`):
 *   khi panel đang mở sẵn, rê chuột sang ô kế bên chuyển ngay không delay → cảm giác
 *   quét mượt như tooltip thật, thay vì mỗi ô đều phải chờ lại 150ms (giật/khựng).
 * - Close delay 100ms là grace period: rời 1 ô rồi vào ô khác trong 100ms sẽ bị
 *   `clearTimers()` huỷ trước khi kịp đóng → không nhấp nháy giữa các ô liền kề.
 */
export function useNumberHeatmapHover<T extends NumberHeatmapHoverItem = NumberHeatmapHoverItem>() {
  const [hovered, setHovered] = useState<NumberHeatmapHovered<T> | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveredNumberRef = useRef<string | null>(null);
  // Ref (không phải state) để tránh onCellEnter/onCellLeave đổi identity mỗi lần hover
  // đổi ô — nếu không, N cell re-render theo mỗi lần rê chuột, mất hết lợi ích O(1).
  const isOpenRef = useRef<boolean>(false);

  const clearTimers = useCallback(() => {
    if (openTimerRef.current !== null) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  const onCellEnter = useCallback(
    (el: HTMLElement, item: T) => {
      clearTimers();
      hoveredNumberRef.current = item.number;

      if (isOpenRef.current) {
        // Đang có panel hiện sẵn — quét sang ô khác thì chuyển ngay, không delay.
        setHovered({ item, rect: el.getBoundingClientRect() });
        return;
      }

      openTimerRef.current = setTimeout(() => {
        if (hoveredNumberRef.current === item.number) {
          isOpenRef.current = true;
          setHovered({ item, rect: el.getBoundingClientRect() });
        }
      }, OPEN_DELAY_MS);
    },
    [clearTimers],
  );

  const onCellLeave = useCallback(() => {
    clearTimers();
    hoveredNumberRef.current = null;
    closeTimerRef.current = setTimeout(() => {
      isOpenRef.current = false;
      setHovered(null);
    }, CLOSE_DELAY_MS);
  }, [clearTimers]);

  return { hovered, onCellEnter, onCellLeave };
}
