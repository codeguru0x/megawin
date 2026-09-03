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
 *
 * NÚT "MỞ RỘNG" — hai thứ phối hợp để cú chuyển sang `/ai` không còn hẫng (sửa 19/08):
 * `useTransition` để nút hiện spinner trong lúc chờ, và KHÔNG tự đóng panel tại chỗ (để effect
 * `pathname` của `AiPanelProvider` đóng sau khi trang mới đã lên). Chi tiết ở `onClick`.
 *
 * ⚠️ KHÔNG prefetch khi hover/focus (đã bỏ 04/09). Từng thêm `router.prefetch()` ở `onMouseEnter`/
 * `onFocus` để warm cache trước khi bấm — nhưng `/ai` là route dynamic session-gated, không cache
 * được (`DYNAMIC_STALETIME_MS` = 0 mặc định), nên MỌI lần gọi đều tạo 1 request RSC mới, hết hạn
 * ngay. Production ghi nhận hàng trăm request `_rsc` lặp lại dù đã thêm guard dedupe-theo-href —
 * lợi ích (giảm độ trễ khi bấm, đã có spinner `isNavigating` bù) không đáng với rủi ro loop. Xem
 * lịch sử fix trong PR liên quan nếu cần khôi phục ý tưởng này bằng cơ chế khác an toàn hơn.
 */

import type { ReactNode } from "react";
import { useTransition } from "react";

import { useRouter } from "next/navigation";

import {
  ExpandIcon,
  Loader2Icon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  Sparkles,
  SquarePenIcon,
  X,
} from "lucide-react";
import type { Route } from "next";

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

  // `AI_FULL_PAGE_PATH` là hằng số nội bộ (route `/ai` cố định) — an toàn cast, không qua nav-registry.
  const fullPageHref = (activeThreadId ? `${AI_FULL_PAGE_PATH}?thread=${activeThreadId}` : AI_FULL_PAGE_PATH) as Route;

  // `isPending` bật trong suốt lúc Next tải RSC payload của `/ai` — nút đổi sang spinner để staff
  // biết cú bấm ĐÃ được nhận. Bản trước không có tín hiệu nào ở đây: panel biến mất tức thì rồi màn
  // hình đứng im vài trăm ms tới vài giây, đọc ra thành "bấm xong web tự tắt panel rồi treo".
  const [isNavigating, startNavigation] = useTransition();

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
            disabled={isNavigating}
            onClick={() => {
              // Cùng agent instance (p1-01 §2.1.1) — promote chỉ là đổi surface, KHÔNG
              // chuyển state: `/ai` đọc `activeThreadId` từ ĐÚNG registry panel đang dùng.
              //
              // ⚠️ KHÔNG gọi `onClose()` ở đây (sửa 19/08). `router.push` là bất đồng bộ; đóng panel
              // ngay tại chỗ làm nội dung chat biến mất TRƯỚC khi `/ai` render xong, để lại một
              // khoảng trống — chính cảm giác "bấm xong web tắt panel rồi chờ mới sang trang".
              // `AiPanelProvider` đã có effect tự đóng panel khi `pathname === "/ai"`, tức panel chỉ
              // tắt SAU khi trang mới đã lên. Bọc trong `startTransition` để `isPending` phản ánh
              // đúng thời gian chờ đó.
              startNavigation(() => {
                router.push(fullPageHref);
              });
            }}
            size="icon-sm"
            variant="ghost"
          >
            {isNavigating ? <Loader2Icon className="animate-spin" /> : <ExpandIcon />}
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
