"use client";

/**
 * AI Threads — Provider theo khuôn `stores/preferences/preferences-provider.tsx`.
 *
 * Mounted ở `(main)/layout.tsx`, BAO NGOÀI `AiPanelProvider` — cả panel và trang `/ai` đọc
 * cùng registry này để biết thread nào đang active (điều kiện cho "1 agent instance", p1-01
 * §2.1.1). Store khởi tạo rỗng, hydrate thật từ `localStorage` trong effect đầu tiên — xem
 * JSDoc `ai-threads-store.ts` về lý do (tránh hydration mismatch).
 */

import { createContext, useContext, useEffect, useState } from "react";

import { type StoreApi, useStore } from "zustand";

import { type AiThreadsState, createAiThreadsStore } from "./ai-threads-store";
import { loadOrInitThreadRegistry } from "./thread-storage";

const AiThreadsStoreContext = createContext<StoreApi<AiThreadsState> | null>(null);

export function AiThreadsProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState<StoreApi<AiThreadsState>>(() => createAiThreadsStore());

  // Chạy đúng 1 lần sau mount — đọc/khởi tạo registry (tạo thread rỗng nếu chưa có, migrate
  // saved chat panel-only cũ nếu có) rồi đổ vào store. Trước lúc này `hydrated=false`, UI phải
  // tự gate theo cờ đó (xem `useAiThreadsStore` selector `hydrated`).
  useEffect(() => {
    const registry = loadOrInitThreadRegistry();
    store.getState().hydrate(registry.threads, registry.activeThreadId);
  }, [store]);

  return <AiThreadsStoreContext.Provider value={store}>{children}</AiThreadsStoreContext.Provider>;
}

export function useAiThreadsStore<T>(selector: (state: AiThreadsState) => T): T {
  const store = useContext(AiThreadsStoreContext);
  if (!store) {
    throw new Error("useAiThreadsStore must be used within an AiThreadsProvider");
  }
  return useStore(store, selector);
}

/**
 * Store API thô — đọc/ghi KHÔNG subscribe (`getState()`), dùng khi component chỉ cần snapshot tại
 * một thời điểm chứ không muốn re-render theo registry.
 *
 * Cần thiết cho `AgentBridge`: nó mirror stream eve vào registry liên tục trong lúc stream, nên nếu
 * subscribe bằng selector `threads.find(...)` thì mỗi lần tự ghi sẽ tự làm chính nó re-render
 * (vòng ghi → re-render → ghi). Đọc bằng `getState()` cắt hẳn vòng đó.
 */
export function useAiThreadsStoreApi(): StoreApi<AiThreadsState> {
  const store = useContext(AiThreadsStoreContext);
  if (!store) {
    throw new Error("useAiThreadsStoreApi must be used within an AiThreadsProvider");
  }
  return store;
}
