"use client";

/** Trang `/ai` — đồng bộ `?thread=<id>` ↔ thread registry. Xem JSDoc `ThreadUrlSync`. */

import { useEffect, useRef } from "react";

import { parseAsString, useQueryState } from "nuqs";
import { useShallow } from "zustand/react/shallow";

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
 *
 * ỔN ĐỊNH DEPS (mục 6 phân tích loop, 2026-09) — 2 nguồn khiến effect bị NHẮC LẠI DƯ (không phải
 * loop, chỉ chạy thừa) đã được giảm, KHÔNG đổi logic phân biệt "ai vừa đổi" ở trên:
 * 1. `setThreadParam` (nuqs) đổi reference MỖI LẦN RENDER — đưa qua ref, đọc `.current` trong
 *    effect, bỏ khỏi dependency array.
 * 2. `threads` (toàn bộ `AiThread[]`, đổi reference mỗi lần `AgentBridge` mirror stream — vài
 *    lần/giây lúc đang chat) → narrow xuống CHỈ danh sách id qua `useShallow`, effect chỉ cần
 *    biết "id trong URL có tồn tại trong registry không", không cần nội dung thread.
 */
export function ThreadUrlSync() {
  const [threadParam, setThreadParam] = useQueryState("thread", parseAsString);
  const activeThreadId = useAiThreadsStore((s) => s.activeThreadId);
  const hydrated = useAiThreadsStore((s) => s.hydrated);
  // `useShallow` giữ nguyên reference của mảng id khi TẬP id không đổi (thêm/xoá thread) — nội
  // dung 1 thread đổi (title/events/session lúc mirror stream) KHÔNG làm effect bị nhắc lại.
  const threadIds = useAiThreadsStore(useShallow((s) => s.threads.map((thread) => thread.id)));
  const setActiveThread = useAiThreadsStore((s) => s.setActiveThread);

  const prevActiveThreadIdRef = useRef<string | undefined>(undefined);
  const didInitialSyncRef = useRef(false);
  // Giá trị vừa ghi vào URL nhưng `threadParam` CHƯA phản ánh (nuqs cập nhật URL bất đồng bộ, có
  // throttle). Xem nhánh "cửa sổ chờ" trong effect.
  const pendingUrlValueRef = useRef<string | undefined>(undefined);
  // `setThreadParam` đổi reference mỗi render (hành vi nuqs) — đọc bản MỚI NHẤT qua ref thay vì
  // đưa vào dependency array, tránh effect bị nhắc lại chỉ vì nuqs cấp hàm mới mà chẳng có giá
  // trị nào khác (threadParam/activeThreadId/threadIds) thực sự đổi.
  const setThreadParamRef = useRef(setThreadParam);
  setThreadParamRef.current = setThreadParam;

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    // biome-ignore lint/suspicious/noUnnecessaryConditions: Biome không track mutation runtime của ref.current qua các lần render — didInitialSyncRef.current thực sự đổi thành true ở nhánh này, effect sau lần chạy đầu sẽ thấy false này là true.
    if (!didInitialSyncRef.current) {
      didInitialSyncRef.current = true;
      prevActiveThreadIdRef.current = activeThreadId;
      if (threadParam && threadParam !== activeThreadId && threadIds.includes(threadParam)) {
        setActiveThread(threadParam);
      } else if (threadParam !== activeThreadId) {
        pendingUrlValueRef.current = activeThreadId;
        void setThreadParamRef.current(activeThreadId ?? null, { history: "replace" });
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
      void setThreadParamRef.current(activeThreadId ?? null, { history: "replace" });
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
    if (threadParam && threadIds.includes(threadParam)) {
      pendingUrlValueRef.current = undefined;
      setActiveThread(threadParam);
    }
  }, [hydrated, threadParam, activeThreadId, threadIds, setActiveThread]);

  return null;
}
