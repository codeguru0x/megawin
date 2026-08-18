/**
 * AI Threads — Zustand vanilla store (state shape), theo khuôn `stores/preferences/*`.
 *
 * State KHỞI TẠO LUÔN rỗng (`threads: []`, `activeThreadId: undefined`) — bất kể server hay
 * client — để tránh hydration mismatch. Dữ liệu thật từ `localStorage` được đổ vào SAU khi
 * mount qua `hydrate()` (gọi trong effect ở `AiThreadsProvider`), giống pattern `hydrated` flag
 * đã dùng cho panel chat (p0-03 §2.1). KHÔNG đọc `localStorage` trong initializer của store.
 */

import { createStore } from "zustand/vanilla";

import type { AiThread } from "./thread-storage";
import { createAndPersistThread, persistThreadRegistry } from "./thread-storage";

export interface AiThreadsState {
  /** `false` cho tới khi effect đọc xong `localStorage` — UI dựa vào cờ này để tránh flash/mismatch. */
  hydrated: boolean;
  threads: AiThread[];
  activeThreadId: string | undefined;
  /** Đổ dữ liệu thật từ `localStorage` vào store — gọi đúng 1 lần sau mount. */
  hydrate: (threads: AiThread[], activeThreadId: string | undefined) => void;
  setActiveThread: (id: string) => void;
  /**
   * Tạo thread rỗng mới, đặt làm active — dùng cho nút "Chat mới" ở cả panel và trang `/ai`.
   *
   * NO-OP nếu thread active hiện tại đã rỗng (chưa gửi message nào) — tránh sinh hàng loạt "Hội thoại
   * mới" rác mỗi lần staff bấm. Đồng thời dọn các thread rỗng cũ còn sót trong registry.
   */
  createThread: () => void;
  removeThread: (id: string) => void;
  renameThread: (id: string, title: string) => void;
  /**
   * Ghi kết quả 1 turn vào thread — gọi trong `onFinish` của `useEveAgent`. Set title từ message
   * user đầu tiên nếu thread chưa có title (p1-01 §2.4).
   */
  recordTurn: (
    id: string,
    turn: { events: AiThread["events"]; session: AiThread["session"]; title: string | undefined },
  ) => void;
}

export const createAiThreadsStore = () =>
  createStore<AiThreadsState>()((set, get) => ({
    hydrated: false,
    threads: [],
    activeThreadId: undefined,

    hydrate: (threads, activeThreadId) => {
      set({ threads, activeThreadId, hydrated: true });
    },

    setActiveThread: (id) => {
      const { threads } = get();
      if (!threads.some((thread) => thread.id === id)) {
        return;
      }
      set({ activeThreadId: id });
      persistThreadRegistry({ threads, activeThreadId: id });
    },

    createThread: () => {
      const { threads, activeThreadId } = get();
      const active = threads.find((thread) => thread.id === activeThreadId);
      // Đang ở hội thoại RỖNG (chưa gửi gì) → không tạo thêm, giữ nguyên. Giống ChatGPT: bấm "New
      // chat" khi đang ở chat trắng thì không sinh thêm hội thoại. Bản trước tạo mới vô điều kiện nên
      // mỗi lần staff bấm là +1 "Hội thoại mới" rỗng — verify 17/08 sinh 16 item rác trong registry.
      if (active && active.title === "" && active.events.length === 0) {
        return;
      }
      // Dọn luôn các hội thoại rỗng cũ còn sót (chỉ là vỏ, không có nội dung đã gửi) — nếu không,
      // danh sách bị rác che mất hội thoại thật.
      const kept = threads.filter((thread) => thread.title !== "" || thread.events.length > 0);
      const { thread, registry } = createAndPersistThread({ threads: kept, activeThreadId });
      set({ threads: registry.threads, activeThreadId: thread.id });
    },

    removeThread: (id) => {
      const { threads, activeThreadId } = get();
      const remaining = threads.filter((thread) => thread.id !== id);
      // Xoá thread đang active → chuyển sang thread gần cập nhật nhất, hoặc tạo mới nếu hết.
      if (remaining.length === 0) {
        const { thread, registry } = createAndPersistThread({ threads: [], activeThreadId: undefined });
        set({ threads: registry.threads, activeThreadId: thread.id });
        return;
      }
      const nextActiveId =
        activeThreadId === id ? remaining.toSorted((a, b) => b.updatedAt - a.updatedAt)[0]?.id : activeThreadId;
      set({ threads: remaining, activeThreadId: nextActiveId });
      persistThreadRegistry({ threads: remaining, activeThreadId: nextActiveId });
    },

    renameThread: (id, title) => {
      const { threads, activeThreadId } = get();
      const next = threads.map((thread) => (thread.id === id ? { ...thread, title, updatedAt: Date.now() } : thread));
      set({ threads: next });
      persistThreadRegistry({ threads: next, activeThreadId });
    },

    recordTurn: (id, turn) => {
      const { threads, activeThreadId } = get();
      const now = Date.now();
      const next = threads.map((thread) =>
        thread.id === id
          ? {
              ...thread,
              events: turn.events,
              session: turn.session,
              title: thread.title === "" ? (turn.title ?? thread.title) : thread.title,
              updatedAt: now,
            }
          : thread,
      );
      set({ threads: next });
      persistThreadRegistry({ threads: next, activeThreadId });
    },
  }));
