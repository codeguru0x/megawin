"use client";

/**
 * Ops Hub — Bàn phím cấp trang (guideline §1.4.8, §10)
 *
 * ĐÚNG 1 `keydown` listener ở `window`, gắn 1 lần cho toàn trang Ops Hub — KHÔNG mỗi
 * dòng/card một listener riêng (`vercel-react-best-practices` §4.1).
 *
 * Dòng "đang focus" (di chuyển bằng `j`/`k`) giữ ở `useRef` + set/xoá `data-focused` trực tiếp
 * trên DOM (CSS `.queue-row[data-focused="true"]` — `globals.css`), KHÔNG React state: di
 * chuyển qua hàng trăm dòng bằng `setState` = hàng trăm re-render mỗi lần bấm phím (plan §10).
 *
 * Bỏ qua toàn bộ phím tắt khi đang gõ trong `input`/`textarea` (ô search 5B, ô `reason` dialog)
 * — nếu không, gõ chữ `r` trong ô lý do huỷ sẽ refetch giữa lúc đang nhập.
 */

import { useEffect, useRef } from "react";

import { toast } from "sonner";

import type { DerivedRow } from "../../hub-types";
import { useHubContext } from "../../use-hub-context";
import { useHubUrlParams } from "../../use-hub-url-params";
import { HUB_GATE_TAB_ORDER } from "./queue-types";

const SHORTCUTS_HELP = [
  "j / k — Xuống / lên dòng",
  "x — Toggle chọn dòng đang focus",
  "Enter — Mở chi tiết ở tab mới",
  "1–5 — Nhảy tab chặng",
  "← / → — Lùi/tiến 1 kỳ ở Focus Rail, Shift = 10 kỳ",
  "Home / End — Đầu/cuối ngày",
  "c — Về biên chốt cược",
  "r — Refetch ngay",
].join("\n");

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function setRowFocusAttr(drawId: string | null, value: boolean) {
  if (!drawId) {
    return;
  }
  document.getElementById(`hub-row-${drawId}`)?.setAttribute("data-focused", String(value));
}

export function useHubKeyboard(onOpenDetail: (drawId: string) => void) {
  const { state, actions } = useHubContext();
  const [, setUrlParams] = useHubUrlParams();

  // Ref, KHÔNG state — snapshot mới nhất của rows5A/dayFlow để handler đọc mà không cần
  // đăng ký lại listener mỗi lần data đổi (closure luôn đọc `.current` mới nhất).
  const rows5ARef = useRef<readonly DerivedRow[]>(state.rows5A);
  rows5ARef.current = state.rows5A;
  const dayFlowRef = useRef(state.dayFlow);
  dayFlowRef.current = state.dayFlow;
  const boundaryDrawIdRef = useRef(state.boundaryDrawId);
  boundaryDrawIdRef.current = state.boundaryDrawId;
  const focusedIdRef = useRef<string | null>(null);

  // Callback cũng qua ref (không phải dependency) — cùng lý do: effect chỉ chạy 1 lần khi mount,
  // KHÔNG remount listener mỗi khi Provider render lại tạo callback mới (`vercel-react-best-practices` §8.2).
  const setUrlParamsRef = useRef(setUrlParams);
  setUrlParamsRef.current = setUrlParams;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const onOpenDetailRef = useRef(onOpenDetail);
  onOpenDetailRef.current = onOpenDetail;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) {
        return;
      }

      const rows = rows5ARef.current;
      const dayFlow = dayFlowRef.current;

      // ── 1-5: nhảy tab chặng ──────────────────────────────────────────────
      const tabIdx = Number(e.key) - 1;
      if (e.key >= "1" && e.key <= "5" && tabIdx < HUB_GATE_TAB_ORDER.length) {
        const tab = HUB_GATE_TAB_ORDER[tabIdx];
        if (tab) {
          void setUrlParamsRef.current({ gate: tab, sort: null, dir: null });
        }
        return;
      }

      // ── j/k: di chuyển dòng focus trong rows5A (bảng đang hiện) ─────────
      if (e.key === "j" || e.key === "k") {
        if (rows.length === 0) {
          return;
        }
        const currentIdx = rows.findIndex((r) => r.drawId === focusedIdRef.current);
        const nextIdx =
          currentIdx === -1
            ? 0
            : e.key === "j"
              ? Math.min(rows.length - 1, currentIdx + 1)
              : Math.max(0, currentIdx - 1);
        const nextRow = rows[nextIdx];
        if (!nextRow) {
          return;
        }
        setRowFocusAttr(focusedIdRef.current, false);
        focusedIdRef.current = nextRow.drawId;
        setRowFocusAttr(nextRow.drawId, true);
        document.getElementById(`hub-row-${nextRow.drawId}`)?.scrollIntoView({ block: "nearest" });
        e.preventDefault();
        return;
      }

      // ── x: toggle chọn dòng đang focus ────────────────────────────────
      if (e.key === "x") {
        if (focusedIdRef.current) {
          actionsRef.current.toggleSelect(focusedIdRef.current);
          e.preventDefault();
        }
        return;
      }

      // ── Enter: mở chi tiết dòng đang focus ở tab mới ────────────────────
      if (e.key === "Enter") {
        if (focusedIdRef.current) {
          onOpenDetailRef.current(focusedIdRef.current);
          e.preventDefault();
        }
        return;
      }

      // ── r: refetch ngay ──────────────────────────────────────────────
      if (e.key === "r") {
        actionsRef.current.refresh();
        return;
      }

      // ── ?: bảng phím tắt ─────────────────────────────────────────────
      if (e.key === "?") {
        toast.info("Phím tắt Ops Hub", { description: SHORTCUTS_HELP, duration: 8000 });
        return;
      }

      // ── Điều hướng Focus Rail: ←/→ (1 kỳ), Shift+←/→ (10 kỳ), Home/End, c (về biên) ──
      if (dayFlow.length === 0) {
        return;
      }
      if (e.key === "c") {
        void setUrlParamsRef.current({ focus: null, span: null });
        return;
      }
      if (e.key === "Home") {
        void setUrlParamsRef.current({ focus: dayFlow[0]?.drawId ?? null });
        return;
      }
      if (e.key === "End") {
        void setUrlParamsRef.current({ focus: dayFlow[dayFlow.length - 1]?.drawId ?? null });
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const step = e.shiftKey ? 10 : 1;
        const delta = e.key === "ArrowRight" ? step : -step;
        const currentFocusId = focusedIdRef.current ?? boundaryDrawIdRef.current;
        const idx = dayFlow.findIndex((c) => c.drawId === currentFocusId);
        const baseIdx = idx >= 0 ? idx : dayFlow.length - 1;
        const nextIdx = Math.min(dayFlow.length - 1, Math.max(0, baseIdx + delta));
        const nextCol = dayFlow[nextIdx];
        if (nextCol) {
          void setUrlParamsRef.current({ focus: nextCol.drawId });
        }
        e.preventDefault();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // Chỉ chạy 1 lần — mọi dữ liệu cần đọc lấy qua ref (`.current`), KHÔNG qua dependency, để
    // KHÔNG unmount/remount listener mỗi khi `rows5A`/`dayFlow` đổi (poll ~10s).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
