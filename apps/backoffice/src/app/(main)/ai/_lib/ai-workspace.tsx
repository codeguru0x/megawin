"use client";

/**
 * Trang `/ai` — phần client: bố cục 2 vùng (hội thoại giữa | lịch sử phải) + đồng bộ `?thread=`.
 *
 * BỐ CỤC (quyết định 17/08 sau feedback staff, đối chiếu ChatGPT):
 * - `AppSidebar` (trái) do shell `(main)` lo, LUÔN hiện như mọi trang khác — trang này KHÔNG còn
 *   tự thu gọn nó nữa (xem JSDoc trong `ai-panel-provider.tsx`).
 * - Hội thoại ở giữa, nội dung căn giữa theo `max-w-3xl` (`ConversationContent` + composer).
 * - Lịch sử hội thoại ở **phải**, thu/mở bằng nút trong `PageChatHeader`, trạng thái nhớ qua
 *   cookie `ai_threads_panel` (đọc ở server, xem `page.tsx`) nên không nháy khi tải trang.
 * - Dưới `md` (`useIsMobile`): lịch sử hiện dạng `Sheet` phủ lên, LUÔN mặc định đóng bất kể cookie
 *   — mở sẵn một overlay che nửa màn hình ngay khi vào trang trên điện thoại là hành vi sai.
 */

import type { CSSProperties } from "react";
import { Suspense, useCallback, useRef, useState } from "react";

import { PageChatHeader } from "@/components/ai-chat/chat-header";
import { ChatPanel } from "@/components/ai-chat/chat-panel";
import { ThreadSidebar } from "@/components/ai-chat/thread-sidebar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { AI_THREADS_PANEL_COOKIE } from "@/lib/preferences/ai-panel";
import { setValueToCookie } from "@/server/server-actions";

import { ThreadUrlSync } from "./thread-url-sync";

export function AiWorkspace({
  defaultThreadsOpen,
  insetGap,
}: {
  defaultThreadsOpen: boolean;
  /**
   * Khoảng hở dọc mà `SidebarInset` tự thêm ở variant `inset` (`md:m-2` ⇒ 8px trên + 8px dưới = `1rem`).
   * `"0px"` với variant `sidebar`/`floating`. Đọc từ cookie ở server (xem `page.tsx`).
   */
  insetGap: string;
}) {
  const isMobile = useIsMobile();
  const [threadsOpen, setThreadsOpen] = useState(defaultThreadsOpen);
  const [mobileThreadsOpen, setMobileThreadsOpen] = useState(false);
  // Giữ giá trị mới nhất cho `toggleThreads` — tránh đưa `threadsOpen` vào dependency (callback sẽ
  // đổi reference mỗi lần thu/mở, kéo theo re-render header không cần thiết).
  const threadsOpenRef = useRef(threadsOpen);
  threadsOpenRef.current = threadsOpen;

  const toggleThreads = useCallback(() => {
    if (isMobile) {
      setMobileThreadsOpen((prev) => !prev);
      return;
    }
    // Side-effect (server action ghi cookie) PHẢI nằm ngoài updater của setState — React gọi
    // updater trong lúc render, gọi server action ở đó gây "Cannot update a component while
    // rendering a different component" (cùng lý do như `toggle` trong `ai-panel-provider.tsx`).
    const next = !threadsOpenRef.current;
    setThreadsOpen(next);
    void setValueToCookie(AI_THREADS_PANEL_COOKIE, next ? "open" : "closed");
  }, [isMobile]);

  return (
    // `-m-4 md:-m-6` bù padding của `(main)/layout.tsx` — panel lịch sử và composer chạm mép khung
    // nội dung đúng cảm giác app chat (p1-01 §2.1.2).
    //
    // CHIỀU CAO chốt theo VIEWPORT, KHÔNG thừa hưởng từ cha:
    // - `flex-1` là no-op ở đây (cha trực tiếp `div.min-h-0.flex-1.p-4` là div THƯỜNG).
    // - `h-full`/`100%` cũng sai: `AppSidebar` (menu dài) đẩy `sidebar-wrapper` cao HƠN viewport —
    //   đo thật 17/08: wrapper 859px trong viewport 847px ⇒ khung chat cao theo 859px, dòng hint dưới
    //   composer bị cắt khỏi màn hình.
    // Vì vậy tính trực tiếp: `100svh` − header shell (`h-12` = 3rem) − khoảng hở của `SidebarInset`
    // ở variant `inset` (`--ai-inset-gap`, xem prop `insetGap`). `svh` (không `vh`) để đúng trên
    // mobile khi thanh địa chỉ ẩn/hiện.
    <div
      className="-m-4 flex h-[calc(100svh-3rem-var(--ai-inset-gap))] min-h-0 overflow-hidden md:-m-6"
      style={{ "--ai-inset-gap": insetGap } as CSSProperties}
    >
      <Suspense fallback={null}>
        <ThreadUrlSync />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <ChatPanel
          header={
            <PageChatHeader onToggleThreads={toggleThreads} threadsOpen={isMobile ? mobileThreadsOpen : threadsOpen} />
          }
        />
      </div>
      {isMobile ? (
        <Sheet onOpenChange={setMobileThreadsOpen} open={mobileThreadsOpen}>
          <SheetContent className="w-80 gap-0 p-0" side="right">
            <SheetHeader className="sr-only">
              <SheetTitle>Lịch sử hội thoại</SheetTitle>
            </SheetHeader>
            <ThreadSidebar className="pt-6" />
          </SheetContent>
        </Sheet>
      ) : (
        threadsOpen && (
          <aside aria-label="Lịch sử hội thoại" className="w-72 shrink-0 border-l">
            <ThreadSidebar />
          </aside>
        )
      )}
    </div>
  );
}
