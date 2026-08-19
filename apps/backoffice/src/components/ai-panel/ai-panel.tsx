"use client";

/**
 * AI Panel — Frame theo mode (docked/overlay/drawer).
 *
 * LUÔN mounted (kể cả khi đóng) — chỉ ẨN bằng CSS/Activity, KHÔNG unmount. Đây là điều kiện
 * để p0-03 giữ được state chat (`useEveAgent` sống trong `AiPanelProvider`) khi toggle panel.
 * Nội dung bên trong dùng `ChatPanel` (`src/components/ai-chat/`) — dùng chung với trang
 * `/ai` tương lai (p1-01), panel chỉ thêm frame/resize/drawer xung quanh.
 */

import { Activity, type PointerEvent as ReactPointerEvent, useCallback, useRef } from "react";

import { PanelChatHeader } from "@/components/ai-chat/chat-header";
import { ChatPanel } from "@/components/ai-chat/chat-panel";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { AI_ASSISTANT_NAME } from "@/config/app-config";
import { AI_PANEL_MAX_WIDTH, AI_PANEL_MIN_WIDTH } from "@/lib/preferences/ai-panel";
import { cn } from "@/lib/utils";

import { useAiPanel } from "./ai-panel-provider";
import { AiPanelMode } from "./use-ai-panel-mode";

/**
 * Resize handle — mép trái panel (chỉ docked/overlay). Kéo cập nhật width qua ref +
 * `style.width` trực tiếp trên panel (tránh re-render mỗi px), commit vào state + cookie
 * (qua `actions.setWidth`, đã debounce 300ms) khi pointerup. Hỗ trợ phím mũi tên trái/phải
 * cho keyboard user (focusable, role="separator" chuẩn WAI-ARIA cho resize handle).
 */
const RESIZE_KEYBOARD_STEP = 16;

function AiPanelResizeHandle({
  panelRef,
  width,
  onCommitWidth,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>;
  width: number;
  onCommitWidth: (width: number) => void;
}) {
  const pendingWidthRef = useRef<number | null>(null);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const nextWidth = Math.min(
          AI_PANEL_MAX_WIDTH,
          Math.max(AI_PANEL_MIN_WIDTH, window.innerWidth - moveEvent.clientX),
        );
        pendingWidthRef.current = nextWidth;
        if (panelRef.current) {
          panelRef.current.style.width = `${nextWidth}px`;
        }
      };

      const handlePointerUp = () => {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
        if (pendingWidthRef.current !== null) {
          onCommitWidth(pendingWidthRef.current);
          pendingWidthRef.current = null;
        }
      };

      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    },
    [panelRef, onCommitWidth],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Panel neo bên phải: mũi tên trái = mở rộng (tăng width), phải = thu hẹp.
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onCommitWidth(width + RESIZE_KEYBOARD_STEP);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onCommitWidth(width - RESIZE_KEYBOARD_STEP);
      }
    },
    [width, onCommitWidth],
  );

  return (
    // biome-ignore lint/a11y/useSemanticElements: resize handle cần pointer drag + custom hit-area — <hr> không hỗ trợ onPointerDown; div[role=separator] tabIndex là pattern chuẩn cho resizable panel.
    <div
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      className="absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize touch-none hover:bg-accent active:bg-accent"
      role="separator"
      aria-orientation="vertical"
      aria-label="Đổi độ rộng panel AI"
      aria-valuenow={width}
      aria-valuemin={AI_PANEL_MIN_WIDTH}
      aria-valuemax={AI_PANEL_MAX_WIDTH}
      tabIndex={0}
    />
  );
}

export function AiPanel() {
  const {
    state: { open, width, mode },
    actions: { setOpen, setWidth },
    meta: { panelRef },
  } = useAiPanel();

  const panelBody = (
    <Activity mode={open ? "visible" : "hidden"}>
      <ChatPanel header={<PanelChatHeader onClose={() => setOpen(false)} />} />
    </Activity>
  );

  if (mode === AiPanelMode.Drawer) {
    return (
      <Drawer open={open} onOpenChange={setOpen} direction="right">
        <DrawerContent className="flex flex-col bg-background p-0 data-[vaul-drawer-direction=right]:w-full data-[vaul-drawer-direction=right]:sm:max-w-sm">
          <DrawerTitle className="sr-only">{AI_ASSISTANT_NAME}</DrawerTitle>
          {panelBody}
        </DrawerContent>
      </Drawer>
    );
  }

  if (mode === AiPanelMode.Overlay) {
    return (
      <div
        ref={panelRef}
        data-ai-panel={open ? "open" : "closed"}
        style={{ width }}
        className={cn(
          "fixed inset-y-0 right-0 z-40 flex flex-col border-l bg-background shadow-xl transition-transform duration-200 ease-linear",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <AiPanelResizeHandle panelRef={panelRef} width={width} onCommitWidth={setWidth} />
        {panelBody}
      </div>
    );
  }

  // Docked — flex sibling của SidebarInset; width 0 khi đóng (không border để tránh sliver 1px).
  //
  // `sticky top-0 h-svh self-start` là BẮT BUỘC, không phải trang trí: `sidebar-wrapper` dùng
  // `min-h-svh` (chiều cao AUTO, grow theo con cao nhất) nên nếu panel để `align-items: stretch`
  // mặc định thì chiều cao panel = chiều cao wrapper = chiều cao nội dung chat → chat KHÔNG bao
  // giờ scroll nội bộ, thay vào đó đẩy dài cả trang và để lại vệt trắng bên cột nội dung.
  // `self-start` cắt stretch, `h-svh` chốt chiều cao = viewport (điều kiện để `overflow` bên
  // trong có tác dụng), `sticky top-0` giữ panel trong tầm mắt khi trang cuộn.
  // Nền panel = `--background`, GIỐNG HỆT trang `/ai` (feedback 19/08 lần 3): thử đổi panel sang
  // `--sidebar` cho tách khỏi dashboard, nhưng nền xám làm mọi card/bảng trong panel chìm xuống và
  // panel đọc khác hẳn trang `/ai` — cùng một khung chat mà hai bộ mặt. Sự phân định với vùng
  // dashboard do `border-l` + shadow lo; khác biệt bề mặt dồn vào BUBBLE ô nhập (xem `composer.tsx`).
  return (
    <aside
      ref={panelRef}
      data-ai-panel={open ? "open" : "closed"}
      style={{ width: open ? width : 0 }}
      className={cn(
        "sticky top-0 flex h-svh shrink-0 flex-col self-start overflow-hidden bg-background transition-[width] duration-200 ease-linear",
        open && "border-l",
      )}
    >
      {open && <AiPanelResizeHandle panelRef={panelRef} width={width} onCommitWidth={setWidth} />}
      {panelBody}
    </aside>
  );
}
