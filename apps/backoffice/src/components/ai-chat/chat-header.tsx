"use client";

/**
 * AI Chat — Header, HAI biến thể tường minh theo surface (KHÔNG dùng cờ boolean `isPage` để một
 * component tự đổi hình — xem `vercel-composition-patterns` §1.1/§3.1):
 *
 * | Biến thể | Dùng ở | Nút |
 * |---|---|---|
 * | `PanelChatHeader` | AI Panel (Surface A) | [✎ hội thoại mới] [⤢ mở rộng] [✕ đóng] |
 * | `PageChatHeader` | Trang `/ai` (Surface B) | [✎ hội thoại mới — CHỈ khi panel lịch sử đang ẩn] [⇥ ẩn/hiện lịch sử] |
 *
 * Vì sao trang `/ai` KHÔNG có nút "hội thoại mới" thường trực (feedback staff 17/08): panel lịch sử
 * bên phải đã có nút "Chat mới" dạng chữ rõ ràng — hai nút cùng chức năng nằm hai đầu màn hình gây
 * nhiễu. Nút ở header chỉ xuất hiện khi panel lịch sử bị ẩn, nếu không staff hết đường tạo hội thoại mới.
 *
 * ICON: `SquarePenIcon` (ô vuông + bút) — đúng icon ChatGPT/Claude dùng cho "new chat", staff nhận
 * ra ngay. Trước đây là `SquarePlusIcon` (dấu +), dễ bị đọc thành "thêm mục vào danh sách hiện tại".
 * Ở header chỉ để icon + tooltip, KHÔNG kèm chữ: header cao 48px dùng chung với tên trợ lý, thêm
 * nhãn chữ làm hàng nút lấn sang phần thương hiệu.
 */

import type { ReactNode } from "react";

import { useRouter } from "next/navigation";

import { ExpandIcon, PanelRightCloseIcon, PanelRightOpenIcon, Sparkles, SquarePenIcon, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AI_ASSISTANT_NAME, AI_FULL_PAGE_PATH } from "@/config/app-config";
import { cn } from "@/lib/utils";

import { useAiPanel } from "../ai-panel/ai-panel-provider";

/** Khung + thương hiệu dùng chung; `children` là nhóm nút bên phải của từng biến thể. */
function ChatHeaderFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-12 shrink-0 items-center justify-between gap-2 px-3", className)}>
      <div className="flex items-center gap-2 font-medium text-sm">
        <Sparkles className="size-4 text-primary" />
        {AI_ASSISTANT_NAME}
      </div>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

export function PanelChatHeader({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const {
    state: { activeThreadId },
    actions: { newChat },
  } = useAiPanel();

  return (
    <ChatHeaderFrame className="border-b px-4">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button aria-label="Bắt đầu hội thoại mới" onClick={newChat} size="icon-sm" variant="ghost">
            <SquarePenIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Hội thoại mới</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label="Mở rộng sang trang chat"
            onClick={() => {
              // Cùng agent instance (p1-01 §2.1.1) — promote chỉ là đổi surface, KHÔNG
              // chuyển state: `/ai` đọc `activeThreadId` từ ĐÚNG registry panel đang dùng.
              const href = activeThreadId ? `${AI_FULL_PAGE_PATH}?thread=${activeThreadId}` : AI_FULL_PAGE_PATH;
              router.push(href);
              onClose();
            }}
            size="icon-sm"
            variant="ghost"
          >
            <ExpandIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Mở rộng</TooltipContent>
      </Tooltip>
      <Button aria-label="Đóng hội thoại" onClick={onClose} size="icon-sm" variant="ghost">
        <X />
      </Button>
    </ChatHeaderFrame>
  );
}

export function PageChatHeader({
  threadsOpen,
  onToggleThreads,
}: {
  threadsOpen: boolean;
  onToggleThreads: () => void;
}) {
  const {
    actions: { newChat },
  } = useAiPanel();

  return (
    // KHÔNG `border-b`: trang `/ai` để hội thoại chạy liền mạch từ trên xuống như ChatGPT — mọi
    // đường kẻ ngang chia cắt vùng đọc đều bị bỏ (composer cũng vậy, xem `composer.tsx`).
    <ChatHeaderFrame className="px-4">
      {!threadsOpen && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button aria-label="Bắt đầu hội thoại mới" onClick={newChat} size="icon-sm" variant="ghost">
              <SquarePenIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Hội thoại mới</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={threadsOpen ? "Ẩn lịch sử hội thoại" : "Hiện lịch sử hội thoại"}
            onClick={onToggleThreads}
            size="icon-sm"
            variant="ghost"
          >
            {threadsOpen ? <PanelRightCloseIcon /> : <PanelRightOpenIcon />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{threadsOpen ? "Ẩn lịch sử hội thoại" : "Hiện lịch sử hội thoại"}</TooltipContent>
      </Tooltip>
    </ChatHeaderFrame>
  );
}
