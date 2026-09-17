import { ViewTransition, type ReactNode } from "react";

/**
 * Remount theo route segment — bọc content bằng ViewTransition để enter/exit fire đúng.
 *
 * KHÔNG đặt ViewTransition trong `layout.tsx` (layout persist → enter/exit không chạy).
 * Sidebar/header nằm ở layout → không animate lại mỗi lần đổi route.
 *
 * Pattern: Suspense reveal + crossfade (`enter`/`exit` = auto). Không directional slide —
 * sidebar nav phẳng, không có hierarchy forward/back rõ (p2-02).
 *
 * Lưu ý debug: Uncaught `reading 'startTime'` KHÔNG phải code app — là **bug của chính
 * Chrome DevTools**. Panel Performance inject script Live Metrics (`window.devToolsReportSoftNavs`)
 * vào isolated world; bản Chrome cũ đọc `metric.entries[0].startTime` không optional-chaining →
 * crash khi INP soft-nav có `entries` rỗng. Vá upstream 31/08/2026 ("Live Metrics: Handle empty
 * INP entries"). Cách dứt lỗi: update Chrome, hoặc tắt DevTools setting
 * "Enable soft navigation performance monitoring". Chỉ hiện khi DevTools mở — user thật không thấy.
 */
export default function MainTemplate({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="auto" exit="auto" default="none">
      {children}
    </ViewTransition>
  );
}
