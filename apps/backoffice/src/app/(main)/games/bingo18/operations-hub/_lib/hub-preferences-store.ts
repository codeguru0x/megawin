"use client";

/**
 * Ops Hub — Local Preferences Store (zustand + persist)
 *
 * Chỉ chứa **thói quen cá nhân** của staff (guideline §6.2) — KHÔNG phải view state chia sẻ
 * được (đó thuộc nuqs, xem `use-hub-url-params.ts`). Persist ở `localStorage`, `version` để
 * migrate an toàn, đọc bọc `try/catch` vì `localStorage.getItem` **throw** ở chế độ ẩn danh
 * (Safari/Firefox) — `vercel-react-best-practices` §4.4.
 *
 * KHÔNG đặt ở đây: clock offset (phải tính lại mỗi phiên), selection bảng 5A (p1-02 — action
 * tiền tuyệt đối không phục hồi từ phiên cũ, guideline §6.3).
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface HubPreferencesState {
  /** Bật tiếng `ping` khi `stuckCount` tăng từ 0 lên > 0 (guideline §8.2). Mặc định TẮT. */
  soundOnCritical: boolean;
  /** Ẩn/hiện dải Day Flow (Zone 3) — hữu ích trên màn hình hẹp (guideline rủi ro §11, mục Day Flow). */
  dayFlowVisible: boolean;
  /** Mật độ dòng bảng 5A — `p1-02` dùng, khai sẵn ở đây để không phải thêm store mới. */
  density: "compact" | "comfortable";
  /**
   * Zone 5B Lớp 3 (bảng đầy đủ ~105 kỳ đang bán) mặc định ĐÓNG (guideline §5B) — chỉ mount
   * khi `true`. Persist vì đây là thói quen cá nhân ("tôi hay tra cứu"), không phải view state
   * cần chia sẻ qua link.
   */
  sellingTableExpanded: boolean;
  setSoundOnCritical: (value: boolean) => void;
  setDayFlowVisible: (value: boolean) => void;
  setDensity: (value: "compact" | "comfortable") => void;
  setSellingTableExpanded: (value: boolean) => void;
}

/** Đọc/viết `localStorage` an toàn — không throw ra ngoài khi bị chặn (chế độ ẩn danh, quota). */
const safeLocalStorage = {
  getItem: (name: string): string | null => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      localStorage.setItem(name, value);
    } catch {
      // Ẩn danh / quota đầy — bỏ qua, preference không lưu được thì dùng default ở lần sau.
    }
  },
  removeItem: (name: string): void => {
    try {
      localStorage.removeItem(name);
    } catch {
      // Không sao — không có gì để xoá nếu getItem cũng đã fail.
    }
  },
};

export const useHubPreferences = create<HubPreferencesState>()(
  persist(
    (set) => ({
      soundOnCritical: false,
      dayFlowVisible: true,
      density: "comfortable",
      sellingTableExpanded: false,
      setSoundOnCritical: (value) => set({ soundOnCritical: value }),
      setDayFlowVisible: (value) => set({ dayFlowVisible: value }),
      setDensity: (value) => set({ density: value }),
      setSellingTableExpanded: (value) => set({ sellingTableExpanded: value }),
    }),
    {
      name: "bingo18-ops-hub-preferences",
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({
        soundOnCritical: state.soundOnCritical,
        dayFlowVisible: state.dayFlowVisible,
        density: state.density,
        sellingTableExpanded: state.sellingTableExpanded,
      }),
    },
  ),
);
