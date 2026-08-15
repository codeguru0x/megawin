"use client";

/**
 * Derive AI panel mode (docked/overlay/drawer) từ viewport + sidebar trái + panel width.
 *
 * Nguyên tắc: chỉ hy sinh MỘT trục không gian tại một thời điểm (xem p0-01 §3.1).
 * - Vẫn đủ chỗ với sidebar full → docked, KHÔNG đụng sidebar.
 * - Không đủ với sidebar full nhưng đủ với sidebar icon → auto-collapse sidebar (ưu tiên số 1),
 *   panel vẫn docked.
 * - Không đủ kể cả sidebar icon, nhưng viewport >= 768px → overlay (đè lên content).
 * - Viewport < 768px (hoặc `useSidebar().isMobile`) → drawer.
 *
 * `mode` là derived state — tính lại mỗi lần measured viewport đổi, KHÔNG phải state riêng
 * (rule vercel-react-best-practices §5.1: derive trong render, không đồng bộ qua effect).
 */

import { useEffect, useRef, useState } from "react";

import { useSidebar } from "@/components/ui/sidebar";

export const AiPanelMode = {
  /** Docked: panel là flex item, bóp content. */
  Docked: "docked",
  /** Overlay: panel fixed đè lên content, không bóp. */
  Overlay: "overlay",
  /** Drawer: mobile <768px, vaul full-height. */
  Drawer: "drawer",
} as const;
export type AiPanelMode = (typeof AiPanelMode)[keyof typeof AiPanelMode];

/** Bảng báo cáo tài chính ~10 cột cần tối thiểu ~880px hữu dụng. */
const CONTENT_MIN = 880;
const SIDEBAR_FULL = 256; // = SIDEBAR_WIDTH ("16rem") trong ui/sidebar.tsx
const SIDEBAR_ICON = 48; // = SIDEBAR_WIDTH_ICON ("3rem") trong ui/sidebar.tsx
const MOBILE_BREAKPOINT = 768;
const RESIZE_DEBOUNCE_MS = 100;

function fits(viewport: number, sidebar: number, panel: number): boolean {
  return viewport - sidebar - panel >= CONTENT_MIN;
}

interface UseAiPanelModeInput {
  panelOpen: boolean;
  panelWidth: number;
}

export function useAiPanelMode({ panelOpen, panelWidth }: UseAiPanelModeInput): AiPanelMode {
  const { open: sidebarOpen, setOpen: setSidebarOpen, isMobile } = useSidebar();

  // Measured viewport width — cập nhật qua resize listener (passive, debounce 100ms) để tránh
  // setState mỗi px khi user kéo resize cửa sổ.
  const [viewport, setViewport] = useState<number>(() => (typeof window === "undefined" ? 1280 : window.innerWidth));

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setViewport(window.innerWidth), RESIZE_DEBOUNCE_MS);
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(timeoutId);
    };
  }, []);

  const fitsWithFullSidebar = fits(viewport, SIDEBAR_FULL, panelWidth);
  const fitsWithIconSidebar = fits(viewport, SIDEBAR_ICON, panelWidth);

  const mode: AiPanelMode =
    isMobile || viewport < MOBILE_BREAKPOINT
      ? AiPanelMode.Drawer
      : !panelOpen || fitsWithIconSidebar
        ? AiPanelMode.Docked
        : AiPanelMode.Overlay;

  // restoreSidebarRef: ghi nhớ "sidebar đã bị TA auto-collapse" để restore đúng lúc panel đóng.
  // Không ghi nhớ khi user tự đóng sidebar trước đó — chỉ can thiệp trạng thái do chính hook gây ra.
  const restoreSidebarRef = useRef<boolean>(false);

  useEffect(() => {
    if (isMobile || mode === AiPanelMode.Drawer) {
      return;
    }

    if (!panelOpen) {
      // biome-ignore lint/suspicious/noUnnecessaryConditions: Biome không track mutation runtime của ref.current qua các lần render — restoreSidebarRef.current thực sự có thể là true (set ở nhánh needsAutoCollapse dưới, ở lần chạy effect trước).
      if (restoreSidebarRef.current) {
        restoreSidebarRef.current = false;
        setSidebarOpen(true);
      }
      return;
    }

    const needsAutoCollapse = sidebarOpen && !fitsWithFullSidebar && fitsWithIconSidebar;
    if (needsAutoCollapse) {
      restoreSidebarRef.current = true;
      setSidebarOpen(false);
    } else if (sidebarOpen) {
      // User tự mở lại sidebar trong lúc panel mở (hoặc sidebar đã full từ đầu) — tôn trọng,
      // không ép collapse lại; xoá cờ vì trạng thái hiện tại không còn do hook gây ra.
      restoreSidebarRef.current = false;
    }
  }, [panelOpen, mode, isMobile, sidebarOpen, fitsWithFullSidebar, fitsWithIconSidebar, setSidebarOpen]);

  return mode;
}
