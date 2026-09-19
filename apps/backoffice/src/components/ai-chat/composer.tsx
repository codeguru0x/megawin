"use client";

/**
 * AI Chat — Composer: banner lỗi + PromptInput (bubble) + Stop khi streaming.
 *
 * STYLE (17/08, theo feedback staff + đối chiếu ChatGPT): composer là **bubble nổi trên nội dung**,
 * KHÔNG phải dải footer có `border-t` chia cắt màn hình. Cụ thể:
 * - Không đường kẻ ngang nào. Thay bằng gradient fade từ `background` → trong suốt phía trên, để
 *   tin nhắn cuối "chìm" dần khi cuộn qua composer (cảm giác liền mạch, không bị cắt khúc).
 * - Khung input bo tròn lớn (`rounded-3xl`), chỉ có viền — KHÔNG tô nền, KHÔNG shadow nặng (xem
 *   `BUBBLE_CLASS` cho lịch sử đã thử và lý do chốt).
 * - Căn giữa cùng `max-w-3xl` với `ConversationContent` để input thẳng cột với tin nhắn.
 * - KHÔNG có dòng hint "Enter để gửi · Shift + Enter để xuống dòng" (bỏ 17/08): đây là quy ước
 *   phổ thông của mọi khung chat, staff dùng hằng ngày không cần nhắc; nó chiếm một dòng dưới
 *   composer và đẩy vùng đọc lên. ChatGPT/Claude cũng không hiển thị.
 *
 * Component cha (`ChatPanel`) neo composer bằng `absolute inset-x-0 bottom-0` — mọi khoảng chừa
 * cho vùng cuộn nằm ở `ConversationContent` (`pb-32`), KHÔNG ở đây.
 */
import { useCallback, useImperativeHandle, useRef, useState, type Ref } from "react";

import type { ChatStatus } from "ai";
import type { UseEveAgentStatus } from "eve/react";
import { AlertCircleIcon } from "lucide-react";

import {
  PromptInput,
  PromptInputBody,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { InputGroupAddon } from "@/components/ui/input-group";

import { AgentErrorRecovery, describeAgentError } from "./agent-error";

/**
 * Cửa duy nhất để bên ngoài ghi vào composer — dùng bởi nút "Hỏi lại câu này" trên message assistant
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
 * KHÔNG TÔ NỀN, KHÔNG SHADOW RIÊNG (19/08 lần 4): đã thử `bg-card` (trùng nền, vô hình) rồi
 * `bg-muted` + `shadow-lg` (thấy rõ nhưng nặng nề — một khối xám đặc chiếm đáy khung chat). Chốt:
 * chỉ để lại **viền + shadow mặc định của `InputGroup`** (`border-input`, `shadow-xs`, ring khi
 * focus). Ô nhập được nhận ra bằng ĐƯỜNG VIỀN chứ không bằng mảng màu — nhẹ nhất mà vẫn rõ, và
 * không có mảng màu nào hút mắt khỏi vùng đọc.
 *
 * Dark mode vẫn có nền nhẹ nhờ `dark:bg-input/30` mặc định của `InputGroup` — nền tối cần chút fill
 * để phân biệt, không cần override ở đây.
 *
 * Chỉ giữ lại đúng ba thứ khác mặc định: `h-auto` (bắt buộc, xem trên), `rounded-3xl` (bo lớn kiểu
 * khung chat thay vì `rounded-md` của form), `px-1.5` (chừa chỗ cho nút gửi trong hàng).
 */
const BUBBLE_CLASS = [
  "[&>[data-slot=input-group]]:h-auto",
  "[&>[data-slot=input-group]]:rounded-3xl",
  "[&>[data-slot=input-group]]:px-1.5",
].join(" ");

export function AiComposer({
  status,
  error,
  onSend,
  onStop,
  onNewChat,
  ref,
}: {
  status: UseEveAgentStatus;
  error: Error | undefined;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Gọi khi banner lỗi hiện nút "Bắt đầu chat mới" (`AgentErrorRecovery.NewChat`) — xem `agent-error.ts`. */
  onNewChat: () => void;
  /** Xem {@link AiComposerHandle}. React 19: `ref` là prop thường, không cần `forwardRef`. */
  ref?: Ref<AiComposerHandle>;
}) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // eve 0.45+: `"resuming"` = đang catch-up session cũ — chặn gửi, KHÔNG hiện nút Dừng.
  const isResuming = status === "resuming";
  const isGenerating = status === "submitted" || status === "streaming";
  // `PromptInputSubmit` nhận `ChatStatus` của AI SDK — không có `"resuming"`.
  const submitStatus: ChatStatus | undefined = isResuming ? undefined : status;
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
      if (!text || isGenerating || isResuming) {
        return;
      }
      lastSentTextRef.current = text;
      onSend(text);
      setInput("");
    },
    [onSend, isGenerating, isResuming],
  );

  const handleRetry = useCallback(() => {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: Biome không track mutation runtime của ref.current qua các lần render — lastSentTextRef.current thực sự có thể là string (set ở handleSubmit).
    if (lastSentTextRef.current) {
      onSend(lastSentTextRef.current);
    }
  }, [onSend]);

  // Lỗi phiên làm việc: `window.location.reload()` (KHÔNG `router.refresh()`) — refresh chỉ fetch lại
  // RSC payload, còn client agent store vẫn giữ session eve đã 401; phải load lại trang để proxy
  // `src/proxy.ts` thấy cookie hết hạn và điều hướng sang `/login`.
  const handleReload = useCallback(() => {
    window.location.reload();
  }, []);

  const showRetry = errorDisplay.recovery === AgentErrorRecovery.Retry && lastSentTextRef.current !== undefined;
  const showReload = errorDisplay.recovery === AgentErrorRecovery.Reload;
  const showNewChat = errorDisplay.recovery === AgentErrorRecovery.NewChat;

  return (
    <div className="relative">
      {/* Fade phía trên bubble: nội dung cuộn mờ dần thay vì bị `border-t` cắt ngang. */}
      <div
        aria-hidden="true"
        className="from-background pointer-events-none absolute inset-x-0 -top-10 h-10 bg-linear-to-t to-transparent"
      />
      <div className="bg-background space-y-2 px-3 pb-3">
        <div className="mx-auto w-full max-w-3xl space-y-2">
          {status === "error" && (
            // Layout XẾP DỌC (message trên, hành động thành dải riêng dưới) — theo đúng khối HITL
            // (`render-message.tsx` — card viền + `Button size="sm"` cỡ chuẩn) và banner `cancelStuck`
            // cạnh đây (`chat-panel.tsx`) cho CÙNG hành động "Bắt đầu chat mới". Bản cũ nhồi nút vào
            // MỘT HÀNG với message rồi bóp `h-6 px-2 text-xs variant="ghost"` — ở cỡ đó nút chìm hẳn
            // vào nền đỏ, staff không nhận ra đây là nút bấm được (feedback 15/09).
            <div className="border-destructive/30 bg-destructive/5 space-y-2 rounded-xl border px-3 py-2.5 text-xs">
              <span className="text-destructive flex min-w-0 items-start gap-1.5">
                <AlertCircleIcon className="mt-px size-3.5 shrink-0" />
                <span className="min-w-0">
                  {errorDisplay.message}
                  {/* Chi tiết kỹ thuật CHỈ ở môi trường development (xem `describeAgentError`). */}
                  {errorDisplay.devDetail !== undefined && (
                    <span className="text-3xs mt-1 block font-mono wrap-break-word opacity-70">
                      dev: {errorDisplay.devDetail}
                    </span>
                  )}
                </span>
              </span>
              {(showRetry || showReload || showNewChat) && (
                // `pl-5`: thẳng cột với chữ message (icon 14px + gap 6px ở trên ≈ 20px), không
                // thẳng cột với icon — đúng cách HITL card canh nút theo text, không theo icon.
                <div className="flex flex-wrap gap-2 pl-5">
                  {showRetry && (
                    <Button onClick={handleRetry} size="sm" variant="outline">
                      Thử lại
                    </Button>
                  )}
                  {showReload && (
                    <Button onClick={handleReload} size="sm" variant="outline">
                      Tải lại trang
                    </Button>
                  )}
                  {showNewChat && (
                    // `variant="default"` (primary, KHÔNG `outline` như Retry/Reload): đây là lối ra
                    // DUY NHẤT — không có lựa chọn "gửi lại" nào đứng cạnh để cần tách bạch bằng màu
                    // (khác `tool-approval` HITL, nơi 2 nút cùng hiện nên phải phân cấp bằng variant).
                    <Button onClick={onNewChat} size="sm" variant="default">
                      Bắt đầu chat mới
                    </Button>
                  )}
                </div>
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
                disabled={isResuming || (!isGenerating && input.trim().length === 0)}
                onStop={onStop}
                status={submitStatus}
              />
            </InputGroupAddon>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
