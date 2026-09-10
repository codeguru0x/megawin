"use client";

/**
 * Đồng hồ đếm 1s DÙNG CHUNG cấp trang — ghi thẳng DOM qua `ref`, KHÔNG re-render React.
 *
 * `p1-01-hub-page-shell-kpi.plan.md` §5.4: 200 dòng × 1 `setInterval` riêng = 200 timer.
 * Registry này gom về ĐÚNG 1 `setInterval(1000)` cho toàn trang, mọi `RelativeDuration` chỉ
 * đăng ký `{ ref, sinceMs }` vào 1 `Set` dùng chung.
 *
 * Tiền lệ trong repo: `LastUpdatedBadge` (`keno/operations/page.tsx:46-61`) — cùng ý tưởng
 * (ghi `textContent` qua ref trong `setInterval`), mở rộng thành registry vì p1-01 cần hàng
 * trăm chữ số đếm cùng lúc (không chỉ 1 badge).
 */

interface RegisteredCounter {
  el: HTMLElement;
  /** Epoch ms — mốc bắt đầu đếm. `format` nhận `nowMs - sinceMs` (giây). */
  sinceMs: number;
  format: (elapsedSec: number) => string;
}

const counters = new Set<RegisteredCounter>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function tick(): void {
  const nowMs = Date.now();
  for (const counter of counters) {
    const elapsedSec = Math.max(0, Math.floor((nowMs - counter.sinceMs) / 1000));
    counter.el.textContent = counter.format(elapsedSec);
  }
}

function ensureIntervalRunning(): void {
  if (intervalId === null) {
    intervalId = setInterval(tick, 1000);
  }
}

/**
 * Đăng ký 1 phần tử DOM để registry ghi `textContent` mỗi giây. Gọi `format` ngay lập tức
 * (không chờ tick đầu) để tránh hiện rỗng 1 giây đầu.
 *
 * @returns Hàm huỷ đăng ký — PHẢI gọi lúc unmount, và tự dừng `setInterval` khi hết counter.
 */
export function registerCounter(el: HTMLElement, sinceMs: number, format: (elapsedSec: number) => string): () => void {
  const entry: RegisteredCounter = { el, sinceMs, format };
  counters.add(entry);
  ensureIntervalRunning();

  const nowMs = Date.now();
  el.textContent = format(Math.max(0, Math.floor((nowMs - sinceMs) / 1000)));

  return () => {
    counters.delete(entry);
    if (counters.size === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}
