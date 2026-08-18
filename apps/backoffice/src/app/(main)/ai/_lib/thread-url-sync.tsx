"use client";

/** Trang `/ai` — đồng bộ `?thread=<id>` ↔ thread registry. Xem JSDoc `ThreadUrlSync`. */

import { useEffect, useRef } from "react";

import { parseAsString, useQueryState } from "nuqs";

import { useAiThreadsStore } from "@/stores/ai-threads/ai-threads-provider";

/**
 * Đồng bộ `?thread=<id>` ↔ registry — 2 chiều:
 * - URL đổi từ BÊN NGOÀI (deep-link, back/forward, promote từ panel) → nếu id hợp lệ và khác
 *   active hiện tại, chuyển active sang đó.
 * - Store đổi bằng UI (ThreadSidebar, nút "Chat mới") → viết lại URL bằng `history: "replace"`
 *   (không phá nút Back của staff bằng việc tạo 1 entry mỗi lần bấm đổi thread).
 *
 * CHỈ MỘT effect, tự xác định phía nào THỰC SỰ vừa đổi (so với lần render trước, qua ref) rồi
 * chỉ đồng bộ theo ĐÚNG phía đó — KHÔNG so sánh `threadParam !== activeThreadId` rồi cho cả 2
 * effect cùng hành động trên 1 lần mismatch. Bug thật gặp lúc verify UI (bấm "Chat mới" 100%
 * crash "Maximum update depth exceeded", xác nhận qua Chrome DevTools thật 16/08): bản 2-effect
 * cũ, mỗi effect đọc giá trị "cùng 1 lần render" của phía kia rồi ép nó khớp mình —
 * `createThread()` đổi `activeThreadId` trước, `threadParam` (URL) đổi sau 1 tick; ở lượt render
 * kế, effect "URL→store" thấy `threadParam` (giờ đã là NEW) khác `activeThreadId` (nhưng vì SAO
 * lại là OLD do lượt trước effect kia lỡ ghi đè) nên ép store về NEW, đồng thời effect
 * "store→URL" (đọc `activeThreadId` STALE từ closure render đó, chưa thấy giá trị effect kia vừa
 * ghi) lại ép URL về giá trị cũ khác — 2 effect tráo đổi OLD/NEW cho nhau vô hạn vì không effect
 * nào biết mình đang "phản ứng" hay "gây ra" thay đổi. Dùng ref lưu giá trị lần trước để phân
 * biệt "ai vừa đổi" giải quyết dứt điểm việc này.
 *
 * Lần đồng bộ ĐẦU (ngay khi `hydrated` chuyển true) tách riêng khỏi vòng lặp trên: `activeThreadId`
 * lúc đó đổi từ `undefined` → id thật (registry vừa đọc xong `localStorage`) — nếu áp cùng luật
 * "store vừa đổi → ghi URL" sẽ ghi đè mất `threadParam` của deep-link. Ở mốc này, URL (nếu có id
 * hợp lệ) PHẢI thắng — đó là ý định của người dùng khi mở/dán link `?thread=<id>`.
 */
export function ThreadUrlSync() {
  const [threadParam, setThreadParam] = useQueryState("thread", parseAsString);
  const activeThreadId = useAiThreadsStore((s) => s.activeThreadId);
  const hydrated = useAiThreadsStore((s) => s.hydrated);
  const threads = useAiThreadsStore((s) => s.threads);
  const setActiveThread = useAiThreadsStore((s) => s.setActiveThread);

  const prevActiveThreadIdRef = useRef<string | undefined>(undefined);
  const didInitialSyncRef = useRef(false);
  // Giá trị vừa ghi vào URL nhưng `threadParam` CHƯA phản ánh (nuqs cập nhật URL bất đồng bộ, có
  // throttle). Xem nhánh "cửa sổ chờ" trong effect.
  const pendingUrlValueRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    // biome-ignore lint/suspicious/noUnnecessaryConditions: Biome không track mutation runtime của ref.current qua các lần render — didInitialSyncRef.current thực sự đổi thành true ở nhánh này, effect sau lần chạy đầu sẽ thấy false này là true.
    if (!didInitialSyncRef.current) {
      didInitialSyncRef.current = true;
      prevActiveThreadIdRef.current = activeThreadId;
      if (threadParam && threadParam !== activeThreadId && threads.some((thread) => thread.id === threadParam)) {
        setActiveThread(threadParam);
      } else if (threadParam !== activeThreadId) {
        pendingUrlValueRef.current = activeThreadId;
        void setThreadParam(activeThreadId ?? null, { history: "replace" });
      }
      return;
    }

    const prevActiveThreadId = prevActiveThreadIdRef.current;
    prevActiveThreadIdRef.current = activeThreadId;

    if (threadParam === activeThreadId) {
      pendingUrlValueRef.current = undefined;
      return;
    }

    // Store đổi (createThread/setActiveThread từ UI) → URL đi theo.
    if (activeThreadId !== prevActiveThreadId) {
      pendingUrlValueRef.current = activeThreadId;
      void setThreadParam(activeThreadId ?? null, { history: "replace" });
      return;
    }

    // CỬA SỔ CHỜ: store không đổi so với lần trước, nhưng `threadParam` cũng chưa bắt kịp giá trị ta
    // vừa ghi ⇒ đây KHÔNG phải "URL đổi từ bên ngoài", chỉ là effect chạy lại giữa lúc URL đang được
    // ghi. Bug thật (verify 17/08): bấm "Chat mới" tạo thread mới, effect lần 1 ghi URL đúng, nhưng
    // effect chạy lại NGAY trước khi URL kịp đổi (deps `setThreadParam` của nuqs đổi reference mỗi
    // render) → lúc đó `activeThreadId === prevActiveThreadId` nên rơi vào nhánh "URL thắng" và
    // `setActiveThread(<id CŨ>)` — thread mới bị bỏ rơi, URL/registry quay về thread cũ.
    if (pendingUrlValueRef.current === activeThreadId) {
      return;
    }

    // Còn lại — URL đổi từ bên ngoài (back/forward, dán link) → store đi theo, chỉ khi id hợp lệ
    // (tồn tại trong registry) để tránh set active sang thread không có thật.
    if (threadParam && threads.some((thread) => thread.id === threadParam)) {
      pendingUrlValueRef.current = undefined;
      setActiveThread(threadParam);
    }
  }, [hydrated, threadParam, activeThreadId, threads, setActiveThread, setThreadParam]);

  return null;
}
