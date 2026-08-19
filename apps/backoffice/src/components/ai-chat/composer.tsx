"use client";

/**
 * AI Chat — Composer: banner lỗi + PromptInput (bubble) + Stop khi streaming.
 *
 * STYLE (17/08, theo feedback staff + đối chiếu ChatGPT): composer là **bubble nổi trên nội dung**,
 * KHÔNG phải dải footer có `border-t` chia cắt màn hình. Cụ thể:
 * - Không đường kẻ ngang nào. Thay bằng gradient fade từ `background` → trong suốt phía trên, để
 *   tin nhắn cuối "chìm" dần khi cuộn qua composer (cảm giác liền mạch, không bị cắt khúc).
 * - Khung input bo tròn lớn (`rounded-3xl`) + shadow + nền `muted` → nổi khỏi mặt phẳng hội thoại
 *   (xem `BUBBLE_CLASS` cho lý do chọn `muted` thay vì `card`).
 * - Căn giữa cùng `max-w-3xl` với `ConversationContent` để input thẳng cột với tin nhắn.
 * - KHÔNG có dòng hint "Enter để gửi · Shift + Enter để xuống dòng" (bỏ 17/08): đây là quy ước
 *   phổ thông của mọi khung chat, staff dùng hằng ngày không cần nhắc; nó chiếm một dòng dưới
 *   composer và đẩy vùng đọc lên. ChatGPT/Claude cũng không hiển thị.
 *
 * Component cha (`ChatPanel`) neo composer bằng `absolute inset-x-0 bottom-0` — mọi khoảng chừa
 * cho vùng cuộn nằm ở `ConversationContent` (`pb-32`), KHÔNG ở đây.
 */

import type { Ref } from "react";
import { useCallback, useImperativeHandle, useRef, useState } from "react";

import type { UseEveAgentStatus } from "eve/react";
import { AlertCircleIcon } from "lucide-react";

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import {
  PromptInput,
  PromptInputBody,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { InputGroupAddon } from "@/components/ui/input-group";

import { describeAgentError } from "./agent-error";

/**
 * Cửa duy nhất để bên ngoài ghi vào composer — dùng bởi nút "Sửa lại" trên message user
 * (`render-message.tsx`).
 *
 * VÌ SAO IMPERATIVE, KHÔNG LIFT STATE LÊN `ChatPanel`: thao tác này không phải "đồng bộ một giá
 * trị" mà là một MỆNH LỆNH tại một thời điểm — nạp text, focus, đặt caret ở cuối. Lift `input` lên
 * cha thì mỗi ký tự staff gõ đều re-render cả cây message, và riêng phần focus/caret vẫn phải
 * imperative. Đây đúng ca `useImperativeHandle` được thiết kế cho.
 */
export interface AiComposerHandle {
  /** Ghi `text` vào ô nhập, focus, đặt caret ở cuối để staff sửa tiếp ngay. Ghi ĐÈ nội dung đang có. */
  loadDraft: (text: string) => void;
}

/**
 * Style bubble áp lên `InputGroup` bên trong `PromptInput` (form là con ngoài cùng, `InputGroup`
 * là con trực tiếp của nó → phải nhắm qua `[&>[data-slot=input-group]]`).
 *
 * `h-auto` là BẮT BUỘC: `InputGroup` chốt `h-9` và chỉ nhả `h-auto` khi con TRỰC TIẾP là
 * `<textarea>`; ở đây `PromptInputBody` là div `display:contents` nên `has-[>textarea]` không
 * match, thiếu class này khung bị bóp còn 36px và cắt mất textarea.
 *
 * MÀU NỀN `bg-muted` (19/08 lần 3): trước dùng `bg-card` = ĐÚNG màu `--background`, nên bubble chỉ
 * được nhận ra nhờ viền + shadow — trên nền trắng nó gần như vô hình. Đã thử cách ngược lại (tô xám
 * cả panel để bubble trắng nổi lên) nhưng nền xám làm mọi card/bảng trong panel chìm xuống và panel
 * lệch hẳn so với trang `/ai`. Chốt lại: **nền vùng chat giữ `--background` ở CẢ panel và `/ai`, chỉ
 * bubble được tô** — khác biệt bề mặt gói trong đúng một thành phần, không ảnh hưởng vùng đọc.
 *
 * `focus-within:bg-card` + `ring`: lúc gõ, bubble sáng lên thành mặt phẳng riêng — vừa là phản hồi
 * focus, vừa cho nền trắng dễ đọc khi soạn câu dài.
 */
const BUBBLE_CLASS = [
  "[&>[data-slot=input-group]]:h-auto",
  "[&>[data-slot=input-group]]:rounded-3xl",
  "[&>[data-slot=input-group]]:border-border/60",
  "[&>[data-slot=input-group]]:bg-muted",
  "[&>[data-slot=input-group]]:px-1.5",
  "[&>[data-slot=input-group]]:shadow-lg",
  "[&>[data-slot=input-group]]:transition-colors",
  "[&>[data-slot=input-group]]:focus-within:bg-card",
].join(" ");

export function AiComposer({
  status,
  error,
  onSend,
  onStop,
  ref,
}: {
  status: UseEveAgentStatus;
  error: Error | undefined;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Xem {@link AiComposerHandle}. React 19: `ref` là prop thường, không cần `forwardRef`. */
  ref?: Ref<AiComposerHandle>;
}) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isGenerating = status === "submitted" || status === "streaming";
  // Chuẩn hoá lỗi thô thành câu staff đọc được + ghi log chi tiết (xem `agent-error.ts`). Chỉ tính
  // khi thật sự đang ở trạng thái lỗi — tránh log lại error cũ mỗi lần component render vì lý do khác.
  const errorDisplay = describeAgentError(status === "error" ? error : undefined);
  // Giữ text vừa gửi để nút "Thử lại" gửi lại đúng nội dung — PromptInput đã tự clear input
  // ngay sau submit nên KHÔNG thể đọc lại từ state `input`.
  const lastSentTextRef = useRef<string | undefined>(undefined);

  useImperativeHandle(
    ref,
    () => ({
      loadDraft: (text: string) => {
        setInput(text);
        // Focus + caret cuối trong microtask kế tiếp: `setInput` chưa commit thì `value` của DOM node
        // vẫn là text cũ, `setSelectionRange` sẽ đặt caret theo độ dài CŨ (kẹp về giữa câu nếu text
        // mới dài hơn). Đọc `value` thật của node thay vì `text.length` để không lệch khi PromptInput
        // chuẩn hoá nội dung.
        requestAnimationFrame(() => {
          const node = textareaRef.current;
          if (node === null) {
            return;
          }
          node.focus();
          node.setSelectionRange(node.value.length, node.value.length);
        });
      },
    }),
    [],
  );

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      const text = message.text.trim();
      if (!text || isGenerating) {
        return;
      }
      lastSentTextRef.current = text;
      onSend(text);
      setInput("");
    },
    [onSend, isGenerating],
  );

  const handleRetry = useCallback(() => {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: Biome không track mutation runtime của ref.current qua các lần render — lastSentTextRef.current thực sự có thể là string (set ở handleSubmit).
    if (lastSentTextRef.current) {
      onSend(lastSentTextRef.current);
    }
  }, [onSend]);

  return (
    <div className="relative">
      {/* Fade phía trên bubble: nội dung cuộn mờ dần thay vì bị `border-t` cắt ngang. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-10 h-10 bg-linear-to-t from-background to-transparent"
      />
      <div className="space-y-2 bg-background px-3 pb-3">
        <div className="mx-auto w-full max-w-3xl space-y-2">
          {status === "error" && (
            <div className="flex items-start justify-between gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-destructive text-xs">
              <span className="flex min-w-0 items-start gap-1.5">
                <AlertCircleIcon className="mt-px size-3.5 shrink-0" />
                <span className="min-w-0">
                  {errorDisplay.message}
                  {/* Chi tiết kỹ thuật CHỈ ở môi trường development (xem `describeAgentError`). */}
                  {errorDisplay.devDetail !== undefined && (
                    <span className="wrap-break-word mt-1 block font-mono text-[10px] opacity-70">
                      dev: {errorDisplay.devDetail}
                    </span>
                  )}
                </span>
              </span>
              {/* biome-ignore lint/suspicious/noUnnecessaryConditions: Biome không track mutation runtime của ref.current qua các lần render — lastSentTextRef.current thực sự có thể là string (set ở handleSubmit). */}
              {lastSentTextRef.current && (
                <Button className="h-6 shrink-0 px-2 text-xs" onClick={handleRetry} size="sm" variant="ghost">
                  Thử lại
                </Button>
              )}
            </div>
          )}
          <PromptInput className={BUBBLE_CLASS} onSubmit={handleSubmit}>
            <PromptInputBody>
              {/* `min-h-11 py-3 px-3`: mặc định AI Elements là `min-h-16` (≈64px) — chừa sẵn 2 dòng
                  trống làm bubble cao lêu nghêu. 44px = 1 dòng + padding cân với nút gửi 32px;
                  `field-sizing-content` vẫn tự cao dần tới `max-h-48`. */}
              <PromptInputTextarea
                className="min-h-11 px-3 py-3"
                onChange={(event) => setInput(event.currentTarget.value)}
                placeholder="Hỏi Mira…"
                ref={textareaRef}
                value={input}
              />
            </PromptInputBody>
            {/* Nút gửi CÙNG HÀNG với textarea (`inline-end`) thay vì dải footer `block-end` riêng —
                footer chỉ có 1 nút nhưng ngốn ~46px, làm bubble cao gấp đôi cần thiết (p0-04 §4.14).
                `self-end` PHẢI đặt trên addon: `InputGroup` là flex `items-center` nên addon bị căn
                giữa theo khối textarea đang giãn (nút trôi lên giữa khi nhập nhiều dòng);
                `items-end` truyền vào addon KHÔNG cứu được vì cva của addon đã có `items-center`
                cùng specificity. */}
            <InputGroupAddon align="inline-end" className="self-end pb-2">
              <PromptInputSubmit
                className="rounded-full"
                disabled={!isGenerating && input.trim().length === 0}
                onStop={onStop}
                status={status}
              />
            </InputGroupAddon>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
