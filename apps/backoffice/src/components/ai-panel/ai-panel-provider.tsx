"use client";

/**
 * AI Panel — Provider (context {state, actions, meta}).
 *
 * Nơi DUY NHẤT biết cách persist state (cookie) và derive `mode` (viewport + sidebar).
 * p0-03 sẽ mở rộng provider này để giữ `useEveAgent` — đây là lý do provider LUÔN mounted
 * ở layout (không unmount theo route) và tách biệt khỏi `AiPanel` (frame hiển thị).
 */

import { createContext, type RefObject, use, useCallback, useEffect, useRef, useState } from "react";

import { AI_PANEL_MAX_WIDTH, AI_PANEL_MIN_WIDTH } from "@/lib/preferences/ai-panel";
import { setValueToCookie } from "@/server/server-actions";

import { AiPanelMode, useAiPanelMode } from "./use-ai-panel-mode";

interface AiPanelContextValue {
  state: {
    open: boolean;
    /** px — chỉ áp dụng docked/overlay; drawer luôn full-height/width riêng. */
    width: number;
    mode: AiPanelMode;
  };
  actions: {
    setOpen: (open: boolean) => void;
    toggle: () => void;
    /** Clamp về [AI_PANEL_MIN_WIDTH, AI_PANEL_MAX_WIDTH] + debounce 300ms ghi cookie. */
    setWidth: (width: number) => void;
  };
  meta: {
    panelRef: RefObject<HTMLDivElement | null>;
  };
}

const AiPanelContext = createContext<AiPanelContextValue | null>(null);

const WIDTH_COOKIE_DEBOUNCE_MS = 300;

function clampWidth(width: number): number {
  return Math.min(AI_PANEL_MAX_WIDTH, Math.max(AI_PANEL_MIN_WIDTH, width));
}

export function AiPanelProvider({
  children,
  defaultOpen,
  defaultWidth,
}: {
  children: React.ReactNode;
  defaultOpen: boolean;
  defaultWidth: number;
}) {
  const [open, setOpenState] = useState(defaultOpen);
  const [width, setWidthState] = useState(defaultWidth);
  const panelRef = useRef<HTMLDivElement>(null);
  const widthCookieTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Giữ giá trị `open` mới nhất cho `toggle` — tránh phải đưa `open` vào dependency của
  // useCallback (sẽ làm toggle đổi reference mỗi lần mở/đóng, kéo theo re-subscribe listener).
  const openRef = useRef(open);
  openRef.current = open;

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    void setValueToCookie("ai_panel_state", next ? "open" : "closed");
  }, []);

  const toggle = useCallback(() => {
    // KHÔNG gọi side-effect (server action) bên trong updater của setOpenState — React gọi
    // updater trong lúc render, side-effect ở đó gây lỗi "Cannot update a component while
    // rendering a different component". Tính `next` từ ref rồi gọi setOpen (side-effect nằm
    // ngoài render) như một lệnh imperative bình thường.
    const next = !openRef.current;
    setOpen(next);
  }, [setOpen]);

  const setWidth = useCallback((next: number) => {
    const clamped = clampWidth(next);
    setWidthState(clamped);
    clearTimeout(widthCookieTimeoutRef.current);
    widthCookieTimeoutRef.current = setTimeout(() => {
      void setValueToCookie("ai_panel_width", String(clamped));
    }, WIDTH_COOKIE_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => clearTimeout(widthCookieTimeoutRef.current);
  }, []);

  const mode = useAiPanelMode({ panelOpen: open, panelWidth: width });

  // ⌘I toggle — combo an toàn, không cần guard theo input/textarea đang focus.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "i" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toggle]);

  // Esc chỉ đóng ở overlay/drawer — docked không phản ứng Esc (không phải modal).
  useEffect(() => {
    if (!open || mode === AiPanelMode.Docked) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, mode, setOpen]);

  const value: AiPanelContextValue = {
    state: { open, width, mode },
    actions: { setOpen, toggle, setWidth },
    meta: { panelRef },
  };

  return <AiPanelContext value={value}>{children}</AiPanelContext>;
}

export function useAiPanel(): AiPanelContextValue {
  const context = use(AiPanelContext);
  if (!context) {
    throw new Error("useAiPanel must be used within an AiPanelProvider");
  }
  return context;
}
