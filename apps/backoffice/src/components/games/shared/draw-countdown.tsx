"use client";

/**
 * Shared – Countdown & Overdue helpers cho Draw Command Center (mọi game)
 *
 * Các game chu kỳ ngắn (Keno ~8 phút, Bingo18 ~vài phút) cần người trực ca
 * biết "còn bao lâu" thay vì tự nhìn đồng hồ so với giờ tĩnh. Đồng thời
 * phát hiện trạng thái "kẹt" (scheduler/worker không chạy) qua overdue check.
 *
 * Ngưỡng grace KHÔNG hardcode ở đây — mỗi game truyền ngưỡng riêng vào
 * `useOverdue(target, graceMs)` tuỳ chu kỳ (xem `DEFAULT_OVERDUE_GRACE`).
 *
 * Pattern render: tick 1s cập nhật DOM qua ref (như LastUpdatedBadge) —
 * KHÔNG setState mỗi giây để tránh re-render toàn command center
 * (react-best-practices §5.12). State chỉ đổi khi vượt ngưỡng boolean.
 */

import { useEffect, useRef, useState } from "react";
import { TriangleAlert, Timer } from "lucide-react";
import { formatDurationClock } from "@megawin/shared/utils";
import { cn } from "@/lib/utils";

/**
 * Ngưỡng grace mặc định (ms) cho overdue check — dùng cho game chu kỳ ngắn
 * (Keno, Bingo18). Game chu kỳ dài (Mega645, Power655… 1 kỳ/ngày) nên truyền
 * ngưỡng lớn hơn khi áp dụng.
 *
 * - `close`: quá salesCloseAt + ngưỡng mà status vẫn SalesOpen
 *   → scheduler close-sales có thể không chạy.
 * - `publish`: quá scheduledDrawAt + ngưỡng mà chưa Published
 *   → worker publish-result có thể lỗi.
 */
export const DEFAULT_OVERDUE_GRACE = {
  close: 30_000,
  publish: 120_000,
} as const;

/** Ngưỡng còn lại (ms) chuyển countdown sang đỏ + pulse. */
const URGENT_THRESHOLD_MS = 60_000;

interface CountdownProps {
  /** Mốc thời gian đích (ISO string). */
  target: string;
  /** Text đứng trước số đếm. VD "Đóng bán sau". */
  prefix: string;
  /**
   * Màu mặc định khi chưa urgent (Tailwind classes).
   * Khi còn < 60s tự chuyển destructive + pulse.
   */
  className?: string;
}

/**
 * Đếm ngược tới mốc `target`, tick 1s qua DOM ref (không re-render).
 * Còn < 60s → đỏ + animate-pulse. Về 0 → giữ "00:00" (overdue banner
 * riêng sẽ báo khi quá ngưỡng grace).
 */
export function Countdown({ target, prefix, className }: CountdownProps) {
  const timeRef = useRef<HTMLSpanElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const targetMs = new Date(target).getTime();
    if (Number.isNaN(targetMs)) return;

    function tick() {
      const remaining = targetMs - Date.now();
      if (timeRef.current) {
        timeRef.current.textContent = formatDurationClock(remaining);
      }
      // Toggle urgent style trực tiếp trên DOM — tránh setState mỗi giây
      if (wrapRef.current) {
        const urgent = remaining > 0 && remaining <= URGENT_THRESHOLD_MS;
        wrapRef.current.classList.toggle("text-destructive", urgent);
        wrapRef.current.classList.toggle("animate-pulse", urgent);
      }
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  return (
    <span
      ref={wrapRef}
      className={cn("inline-flex items-center gap-1 text-xs font-medium tabular-nums", className)}
    >
      <Timer className="size-3 shrink-0" />
      {prefix} <span ref={timeRef} className="font-mono font-bold" />
    </span>
  );
}

/**
 * True khi `now > target + graceMs`. Tick 1s nhưng CHỈ setState khi boolean
 * đổi giá trị → re-render duy nhất lúc vượt ngưỡng.
 *
 * @param graceMs Ngưỡng trễ per-game — xem {@link DEFAULT_OVERDUE_GRACE}.
 */
export function useOverdue(target: string | undefined, graceMs: number): boolean {
  const [overdue, setOverdue] = useState(false);

  useEffect(() => {
    if (!target) {
      setOverdue(false);
      return;
    }
    const thresholdMs = new Date(target).getTime() + graceMs;
    if (Number.isNaN(thresholdMs)) return;

    function tick() {
      // Functional update: chỉ trigger re-render khi giá trị thực sự đổi
      setOverdue((prev) => {
        const next = Date.now() > thresholdMs;
        return next === prev ? prev : next;
      });
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target, graceMs]);

  return overdue;
}

/**
 * Banner cảnh báo quá hạn — render trong command center (dưới stepper).
 * Dùng banner thay toast: refetch 15s sẽ spam toast, banner thì persist
 * đến khi trạng thái chuyển.
 */
export function OverdueBanner({ message }: { message: string }) {
  return (
    <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2.5">
      <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
      <p className="text-xs font-medium text-amber-800 dark:text-amber-300">{message}</p>
    </div>
  );
}
