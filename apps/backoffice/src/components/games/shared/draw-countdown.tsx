"use client";

/**
 * Shared – Countdown & Overdue helpers cho Draw Command Center (mọi game)
 *
 * Các game chu kỳ ngắn (Keno ~8 phút, Bingo18 ~vài phút) cần người trực ca
 * biết "còn bao lâu" thay vì tự nhìn đồng hồ so với giờ tĩnh. Đồng thời
 * phát hiện trạng thái "kẹt" (scheduler/worker không chạy) qua overdue check.
 *
 * Ngưỡng grace KHÔNG hardcode rải rác ở từng game — mỗi game lấy ngưỡng qua
 * `getOverdueGrace(gameProduct)` rồi truyền vào `useOverdue(target, graceMs)`
 * (xem `DEFAULT_OVERDUE_GRACE` + `GAME_OVERDUE_GRACE`).
 *
 * Pattern render: tick 1s cập nhật DOM qua ref (như LastUpdatedBadge) —
 * KHÔNG setState mỗi giây để tránh re-render toàn command center
 * (react-best-practices §5.12). State chỉ đổi khi vượt ngưỡng boolean.
 */

import { useEffect, useRef, useState } from "react";

import { GameProduct } from "@megawin/game-core/entities";
import { formatDurationClock } from "@megawin/shared/utils";
import { Timer, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

/** Ngưỡng grace (ms) cho overdue check — 1 cặp `close`/`publish` áp dụng cho 1 game. */
export interface OverdueGrace {
  /** Quá `salesCloseAt` + ngưỡng mà status vẫn SalesOpen → scheduler close-sales có thể không chạy. */
  close: number;
  /** Quá `scheduledDrawAt` + ngưỡng mà chưa Published → worker publish-result có thể lỗi. */
  publish: number;
}

/**
 * Ngưỡng grace mặc định (ms) cho overdue check — hiệu chỉnh cho game chu kỳ
 * NGẮN (Keno ~8 phút, Bingo18 ~6 phút): staff cần biết "kẹt" gần như ngay lập
 * tức vì kỳ sau đã tới rất nhanh.
 *
 * Game nào KHÔNG có entry riêng trong {@link GAME_OVERDUE_GRACE} sẽ dùng ngưỡng
 * này (xem {@link getOverdueGrace}) — đây là fallback an toàn, không phải ngưỡng
 * bắt buộc cho mọi game.
 */
export const DEFAULT_OVERDUE_GRACE: OverdueGrace = {
  close: 30_000,
  publish: 120_000,
} as const;

/**
 * Override ngưỡng overdue grace THEO TỪNG GAME — chỉ khai báo entry cho game
 * mà `DEFAULT_OVERDUE_GRACE` (30s/2m) không phù hợp. Game không có entry ở
 * đây tự động fallback về default qua {@link getOverdueGrace}.
 *
 * **Vì sao map theo `GameProduct` thay vì 1 hằng số "long-cycle" chung dùng
 * cho mọi game chu kỳ dài:** Max3D (quay T2/4/6) và Max3dpro (quay T3/5/7) đều
 * 1 kỳ/ngày nên NGÀY HÔM NAY có cùng giá trị grace — nhưng đây là sự trùng hợp
 * hiện tại, không phải ràng buộc lâu dài. Quy trình đối soát kết quả Vietlott,
 * độ ổn định worker, hay giờ vận hành thực tế có thể lệch nhau giữa 2 game
 * theo thời gian (VD: 1 game đổi sang lấy kết quả từ nguồn khác, chậm hơn).
 * Tách theo key game ngay từ đầu cho phép tinh chỉnh RIÊNG từng game sau khi
 * quan sát vận hành thực tế, mà không đụng tới game còn lại hoặc phải "tách
 * khỏi group long-cycle" sau này.
 *
 * Các game xổ số Vietlott hiện dùng cùng cặp `{close: 5', publish: 15'}` —
 * nhưng KHAI BÁO TÁCH theo từng `GameProduct` (không gộp 1 hằng số chung) vì:
 * - `close`: 5 phút — đóng bán trễ 5' chưa gấp như game 6-8 phút/kỳ, tránh
 *   báo động giả khi staff xử lý các việc khác trong ngày.
 * - `publish`: 15 phút — quay số phụ thuộc quy trình đối chiếu kết quả
 *   Vietlott, có thể chậm vài phút; ngưỡng mặc định 2 phút sẽ báo overdue
 *   liên tục dù vận hành hoàn toàn bình thường.
 *
 * Danh sách game có entry (đều đối soát Vietlott, chu kỳ dài hơn nhiều so với
 * Keno/Bingo18):
 * - `Max3d`   — quay 1 kỳ/ngày (T2/4/6 18h00).
 * - `Max3dpro`— quay 1 kỳ/ngày (T3/5/7 18h00).
 * - `Lotto535`— quay 2 kỳ/ngày (13h + 21h); mỗi kỳ vẫn đối soát Vietlott.
 * - `Mega645` — quay 3 kỳ/tuần (T4/T6/CN 18h00).
 * - `Power655`— quay 3 kỳ/tuần (T3/T5/T7 18h00).
 *
 * Giá trị hiện trùng nhau là sự trùng hợp vận hành hiện tại, KHÔNG phải ràng
 * buộc lâu dài. Tách key game ngay từ đầu cho phép tinh chỉnh RIÊNG từng game
 * sau khi quan sát thực tế (VD: 1 game đổi nguồn kết quả, chậm hơn) mà không
 * đụng game còn lại.
 *
 * Thêm game mới vào đây khi ngưỡng mặc định không hợp lý — KHÔNG hardcode số
 * ms trực tiếp trong `draw-command-center.tsx` của game.
 */
export const GAME_OVERDUE_GRACE: Partial<Record<GameProduct, OverdueGrace>> = {
  [GameProduct.Max3d]: { close: 300_000, publish: 900_000 },
  [GameProduct.Max3dpro]: { close: 300_000, publish: 900_000 },
  [GameProduct.Lotto535]: { close: 300_000, publish: 900_000 },
  [GameProduct.Mega645]: { close: 300_000, publish: 900_000 },
  [GameProduct.Power655]: { close: 300_000, publish: 900_000 },
};

/**
 * Lấy ngưỡng overdue grace áp dụng cho 1 game: override riêng trong
 * {@link GAME_OVERDUE_GRACE} nếu có, else {@link DEFAULT_OVERDUE_GRACE}.
 *
 * Dùng trong command-center của từng game:
 * `useOverdue(draw.salesCloseAt, getOverdueGrace(GameProduct.Max3d).close)`.
 * Tập trung lookup ở 1 hàm duy nhất để khi cần đổi ngưỡng hoặc thêm game mới
 * chỉ sửa `GAME_OVERDUE_GRACE`, không rải hardcode qua nhiều file.
 */
export function getOverdueGrace(game: GameProduct): OverdueGrace {
  return GAME_OVERDUE_GRACE[game] ?? DEFAULT_OVERDUE_GRACE;
}

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
    <span ref={wrapRef} className={cn("inline-flex items-center gap-1 text-xs font-medium tabular-nums", className)}>
      <Timer className="size-3 shrink-0" />
      {prefix} <span ref={timeRef} className="font-mono font-bold" />
    </span>
  );
}

/**
 * True khi `now > target + graceMs`. Tick 1s nhưng CHỈ setState khi boolean
 * đổi giá trị → re-render duy nhất lúc vượt ngưỡng.
 *
 * @param graceMs Ngưỡng trễ per-game — lấy qua {@link getOverdueGrace}, KHÔNG hardcode số ms.
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
