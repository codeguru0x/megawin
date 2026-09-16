import type { ReactNode } from "react";

/**
 * Remount theo route segment (convention Next `template.tsx`).
 *
 * ViewTransition (p2-02) tạm tắt: trên Vercel prod, soft-nav + trang client nặng
 * (`config/tenant`, settle…) kích hoạt web-vitals INP/CLS attribution
 * (`reportAllChanges` → `Cannot read properties of undefined (reading 'startTime')`).
 * Stack anonymous/`requestIdleCallback` — không phải app code; nhưng Uncaught spam console.
 * Bật lại khi Next/web-vitals vá hoặc có gate theo `prefers-reduced-motion` + feature flag.
 */
export default function MainTemplate({ children }: { children: ReactNode }) {
  return children;
}
