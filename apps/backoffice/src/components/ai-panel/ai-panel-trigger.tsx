"use client";

/**
 * Nút mở/đóng AI panel — đặt đầu cụm phải của header `(main)/layout.tsx`, tách khỏi nhóm
 * icon tiện ích (theme, account) bằng Separator. Cùng action `toggle()` với phím tắt `⌘I`
 * (đăng ký trong AiPanelProvider) và command palette (nối ở p0-03).
 *
 * Pill gradient (không phải icon-only ghost) — trợ lý AI là tính năng mới, cần bậc thị giác
 * cao hơn các icon tiện ích để user dễ nhận biết & thử. Chiều cao h-9 khớp size-9 của
 * ThemeSwitcher/Avatar để cả hàng thẳng nhau.
 */

import { Sparkle } from "lucide-react";

import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AI_ASSISTANT_NAME } from "@/config/app-config";
import { cn } from "@/lib/utils";

import { useAiPanel } from "./ai-panel-provider";

export function AiPanelTrigger() {
  const {
    state: { open },
    actions: { toggle },
  } = useAiPanel();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={toggle}
          aria-label={`${AI_ASSISTANT_NAME} — Trợ lý AI`}
          aria-pressed={open}
          className={cn(
            // h-9 để khớp chiều cao size-9 của ThemeSwitcher/Avatar cùng hàng — pill lệch 32px
            // so với 36px làm cả hàng icon trông không cân.
            "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 font-medium text-xs tracking-tight",
            "bg-linear-to-r from-violet-600 via-indigo-500 to-sky-500 text-white",
            // ring-1 mảnh viền trong (không ring-offset) — tạo độ sắc cho mép pill mà không
            // trông như field đang được select trong form.
            "ring-1 ring-indigo-500/40",
            "outline-none transition-[filter,box-shadow] hover:brightness-110",
            "focus-visible:ring-[3px] focus-visible:ring-indigo-400/60",
            // Trạng thái mở: glow toả ra thay vì viền đôi — báo "đang bật" mà vẫn giữ được
            // cảm giác nút hành động, không thành khối bị highlight.
            open && "shadow-indigo-500/40 shadow-lg ring-2 ring-indigo-400/70 brightness-110",
          )}
        >
          <Sparkle className="size-3.5" />
          {AI_ASSISTANT_NAME}
        </button>
      </TooltipTrigger>
      <TooltipContent align="end">
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-2 font-medium">
            {AI_ASSISTANT_NAME}
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>I</Kbd>
            </KbdGroup>
          </span>
          <span className="text-muted-foreground text-xs">Trợ lý AI của MegaWin</span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
