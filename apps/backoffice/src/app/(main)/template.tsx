import type { ReactNode } from "react";
import { ViewTransition } from "react";

/**
 * Remount theo route segment — bọc content bằng ViewTransition để enter/exit fire đúng.
 *
 * KHÔNG đặt ViewTransition trong `layout.tsx` (layout persist → enter/exit không chạy).
 * Sidebar/header nằm ở layout → không animate lại mỗi lần đổi route.
 *
 * Pattern: Suspense reveal + crossfade (`enter`/`exit` = auto). Không directional slide —
 * sidebar nav phẳng, không có hierarchy forward/back rõ (p2-02).
 */
export default function MainTemplate({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="auto" exit="auto" default="none">
      {children}
    </ViewTransition>
  );
}
