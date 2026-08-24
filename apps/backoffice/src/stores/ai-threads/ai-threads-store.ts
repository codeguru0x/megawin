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
   * Ghi state của 1 thread — nguồn duy nhất để `AgentBridge` mirror stream eve vào registry.
   *
   * Chỉ ghi field CÓ trong `patch` (partial). `title` chỉ được set khi thread còn rỗng title
   * (p1-01 §2.4) — lượt sau không đổi tên hội thoại.
   *
   * Gọi ở 4 thời điểm (xem `AgentBridge`): lúc gửi (`pendingTurn: true`), lúc eve cấp/đổi
   * session, throttle trong lúc stream, và lúc turn kết thúc (`pendingTurn: false`). Bản trước
   * CHỈ ghi ở `onFinish` — reload/đổi thread giữa lượt làm cursor tụt lại, gây bug replay lượt cũ
   * (xem {@link threadNeedsCursorResync}).
   *
   * `updatedAt` CHỈ nhích khi thread có **nội dung mới** (số event tăng) — không nhích khi patch
   * chỉ mang `session`/`pendingTurn`. Xem {@link hasNewContent} cho lý do.
   */
  syncThread: (
    id: string,
    patch: {
      events?: AiThread["events"];
      session?: AiThread["session"];
      title?: string | undefined;
      pendingTurn?: boolean;
    },
  ) => void;
}

/**
 * Patch này có mang NỘI DUNG MỚI cho thread không (số event tăng so với bản đang giữ)?
 *
 * Dùng để quyết định có nhích `updatedAt` hay không. `updatedAt` là khoá sắp xếp + phân nhóm ngày
 * của `ThreadSidebar`, nên mỗi lần nhích là danh sách nhảy thứ tự trước mắt người dùng.
 *
 * Bug 24/08: chỉ CLICK chọn 1 hội thoại cũ cũng làm nó nhảy lên đầu danh sách (và đổi nhóm sang
 * "Hôm nay"). Nguyên nhân: `AgentBridge` mount lại → resync cursor với server → `syncThread({
 * events, session, pendingTurn: false })`. Patch đó KHÔNG thêm nội dung nào (events y như cũ),
 * chỉ làm lành cursor, nhưng vẫn set `updatedAt: Date.now()`. Với thread dài, cú nhảy đó trông
 * như giao diện bị nháy.
 *
 * So sánh bằng ĐỘ DÀI thay vì deep-equal: mirror trong lúc stream gọi hàm này vài lần/giây, và
 * events là append-only (eve chỉ nối event mới vào cuối) nên độ dài đủ để phát hiện nội dung mới.
 */
function hasNewContent(current: AiThread, patch: { events?: AiThread["events"] }): boolean {
  return patch.events !== undefined && patch.events.length > current.events.length;
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

    syncThread: (id, patch) => {
      const { threads, activeThreadId } = get();
      const target = threads.find((thread) => thread.id === id);
      if (!target) {
        return;
      }
      const next = threads.map((thread) =>
        thread.id === id
          ? {
              ...thread,
              ...(patch.events === undefined ? {} : { events: patch.events }),
              ...(patch.session === undefined ? {} : { session: patch.session }),
              ...(patch.pendingTurn === undefined ? {} : { pendingTurn: patch.pendingTurn }),
              title: thread.title === "" ? (patch.title ?? thread.title) : thread.title,
              // Chỉ nhích khi thực sự có nội dung mới — xem `hasNewContent`.
              updatedAt: hasNewContent(target, patch) ? Date.now() : thread.updatedAt,
            }
          : thread,
      );
      set({ threads: next });
      persistThreadRegistry({ threads: next, activeThreadId });
    },
  }));
