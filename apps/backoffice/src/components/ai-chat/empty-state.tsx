"use client";

/** AI Chat — Empty state khi chưa có tin nhắn nào: giới thiệu ngắn + gợi ý mở đầu theo route. */

import { usePathname } from "next/navigation";

import { ArrowUpRightIcon, SparklesIcon } from "lucide-react";

import { ConversationEmptyState } from "@/components/ai-elements/conversation";
import { AI_ASSISTANT_NAME } from "@/config/app-config";

import { getRouteSuggestions } from "./route-registry";

export function AiEmptyState({ onSelectSuggestion }: { onSelectSuggestion: (text: string) => void }) {
  const pathname = usePathname();
  const suggestions = getRouteSuggestions(pathname);

  // ⚠️ `ConversationEmptyState` render `children ?? <default>` — truyền children là title/description
  // prop bị BỎ QUA hoàn toàn. Vì vậy dựng trọn phần thân ở đây thay vì truyền cả hai (bug p0-03:
  // trước đây truyền cả title + children nên lời chào không bao giờ hiện).
  //
  // `min-h-[60svh]` + `justify-center`: `ConversationEmptyState` dùng `size-full`, nhưng cha của nó
  // (`ConversationContent`) là flex-col `h-auto` nên `size-full` ≈ chiều cao nội dung → lời chào
  // dính sát mép trên như bug thấy trên ảnh staff gửi (17/08). Chốt chiều cao tối thiểu theo viewport
  // để khối chào + gợi ý nằm giữa vùng đọc như ChatGPT.
  return (
    <ConversationEmptyState className="min-h-[60svh] justify-center gap-6">
      <div className="flex flex-col items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
          <SparklesIcon className="size-6 text-primary" />
        </span>
        <div className="space-y-1">
          {/* Lời chào GIỮ TRUNG TÍNH, không liệt kê năng lực cụ thể (bỏ "Hỏi về tài chính, kỳ quay,
              hoặc bất thường hệ thống" — 17/08): danh sách đó vừa thiếu (còn cấu hình game, kết sổ
              lại, điều hướng báo cáo…) vừa vô tình giới hạn tưởng tượng của staff về việc hỏi được
              gì. Phần gợi ý bên dưới đã làm đúng việc "mồi" câu hỏi theo từng trang. */}
          <h3 className="font-semibold text-xl tracking-tight">Xin chào, tôi là {AI_ASSISTANT_NAME}</h3>
          <p className="text-balance text-muted-foreground text-sm">Rất vui được hỗ trợ. Tôi có thể giúp gì cho bạn?</p>
        </div>
      </div>
      {suggestions.length > 0 && (
        // 1 CỘT DỌC (không grid 2 cột): số gợi ý theo route là lẻ (3 ở `/ai`), grid 2 cột để lại 1
        // ô trống lệch hẳn sang trái — thấy rõ trên ảnh staff gửi 17/08. ChatGPT cũng xếp dọc, mỗi
        // dòng 1 gợi ý kèm icon, viền chỉ hiện khi hover → khối chào nhẹ, không giống form.
        <ul className="mx-auto flex w-full max-w-md flex-col">
          {suggestions.map((suggestion) => (
            <li key={suggestion}>
              <button
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                onClick={() => onSelectSuggestion(suggestion)}
                type="button"
              >
                <ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">{suggestion}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </ConversationEmptyState>
  );
}
