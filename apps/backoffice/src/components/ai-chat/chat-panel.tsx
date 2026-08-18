"use client";

/**
 * AI Chat — `ChatPanel`: compose Header + Conversation + Composer.
 *
 * Dùng chung giữa AI Panel (Surface A) và trang `/ai` (Surface B) — CHỈ khác header truyền vào
 * (`PanelChatHeader` / `PageChatHeader`) và layout wrapper bên ngoài, không khác nội dung chat.
 * Header là `ReactNode` truyền qua prop thay vì cờ boolean bên trong (composition, không phải
 * boolean prop proliferation — xem `vercel-composition-patterns` §1.1).
 */

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

import type { EveMessage } from "eve/react";
import { AlertTriangleIcon } from "lucide-react";

import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";

import { useAiPanel } from "../ai-panel/ai-panel-provider";
import { AssistantHeader } from "./assistant-header";
import { AiComposer } from "./composer";
import { AiEmptyState } from "./empty-state";
import type { AgentInputResponseInput } from "./render-message";
import { AgentMessage } from "./render-message";

/**
 * Message assistant này đang chạy — đọc `metadata.status` của CHÍNH message (eve gán `"streaming"`
 * lúc tạo message của lượt, đổi `"complete"` ở `turn.completed`/`turn.cancelled`).
 *
 * KHÔNG suy bằng "là message cuối mảng". Store eve set `status: "submitted"` rồi notify subscriber
 * NGAY khi staff bấm gửi, nhưng optimistic user message chỉ được thêm SAU `await prepareSend()`.
 * Trong cửa sổ đó `messages` vẫn nguyên của lượt trước ⇒ message cuối là message assistant ĐÃ XONG
 * của lượt trước. Suy theo vị trí sẽ đánh dấu nó "đang chạy" trong vài ms, và cú flip
 * true→false đó khiến nhãn thời lượng của nó bị TÍNH LẠI từ mốc lượt mới (bug 18/08: lượt chạy
 * 17 giây bị ghi đè thành "Đã xử lý trong 1 giây" ngay khi staff gửi câu tiếp theo).
 */
function isAssistantStreaming(message: EveMessage): boolean {
  return message.role === "assistant" && message.metadata?.status === "streaming";
}

/**
 * Chỗ đứng của Mira trong lúc server chưa trả part nào.
 *
 * Trước đây là 3 dot nhảy (p0-04 §4.5 U7), giờ dùng ĐÚNG header của message assistant thật: khi
 * message thật tới, hàng header không nhảy chỗ, chỉ có phần thân mọc ra bên dưới. Đồng hồ ở đây và
 * ở message thật cùng đọc một mốc `turnStartedAt` nên số giây liền mạch, không nhảy về 0.
 */
function PendingAssistantTurn({ turnStartedAt }: { turnStartedAt: number | null }) {
  return (
    <Message from="assistant">
      <AssistantHeader hasText={false} isActive={true} turnStartedAt={turnStartedAt} />
    </Message>
  );
}

export function ChatPanel({ header }: { header: ReactNode }) {
  const {
    state: { messages, status, error, cancelStuck },
    actions: { send, respond, stop, newChat },
  } = useAiPanel();

  // Lịch sử chat được resume từ `sessionStorage` (chỉ tồn tại ở client) — render nó ngay lần
  // render đầu sẽ lệch với HTML server (server luôn thấy 0 message) → hydration mismatch.
  // Lần render đầu ở client cố tình hiển thị empty state y như server, rồi mới đổ lịch sử.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const canRespond = status !== "submitted" && status !== "streaming";
  const isStreaming = status === "streaming";
  const isActiveTurn = status === "submitted" || status === "streaming";
  // Turn đã kết thúc ⇒ mọi tool part chưa có output là MỒ CÔI, không thể chạy tiếp (p0-04 §3.2).
  const turnEnded = status === "ready" || status === "error";
  const showMessages = hydrated && messages.length > 0;

  // Mốc bắt đầu lượt, dùng cho đồng hồ "Đang suy nghĩ… N giây" cạnh tên Mira.
  //
  // GIỮ Ở ĐÂY (không ở `AssistantHeader`) vì lượt bắt đầu TRƯỚC khi message assistant tồn tại: đo
  // từ lúc message xuất hiện sẽ mất 1-3 giây đầu — đúng khoảng staff sốt ruột nhất. Chỉ là mốc số,
  // không tick, nên không gây re-render mỗi giây ở tầng này (tick nằm trong `AssistantHeader`).
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
  useEffect(() => {
    // CHỈ đặt mốc khi vào lượt mới, KHÔNG reset về `null` khi lượt xong: `AssistantHeader` của
    // message vừa xong vẫn cần mốc này để chốt tổng thời gian. Reset ở đây làm nó rơi vào nhánh
    // fallback `Date.now()` và ra "1 giây" cho mọi lượt (bug 18/08).
    if (isActiveTurn) {
      setTurnStartedAt(Date.now());
    }
  }, [isActiveTurn]);

  // Chưa có message assistant nào cho lượt này ⇒ render chỗ đứng của Mira, nếu không panel im lặng
  // hoàn toàn (đặc biệt sau khi đã ẩn card tool khỏi hội thoại).
  const lastMessage = messages.at(-1);
  const showPendingTurn =
    isActiveTurn &&
    (lastMessage === undefined ||
      lastMessage.role === "user" ||
      lastMessage.parts.length === 0 ||
      // Message cuối là assistant ĐÃ XONG của lượt trước (cửa sổ giữa `status: "submitted"` và lúc
      // optimistic user message được thêm) ⇒ lượt mới chưa có message nào, vẫn phải hiện chỗ đứng.
      !isAssistantStreaming(lastMessage));

  const handleInputResponses = useCallback(
    (responses: readonly AgentInputResponseInput[]) => {
      void respond(responses).catch((responseError: unknown) => {
        console.error("[ai-panel] trả lời input request thất bại", responseError);
      });
    },
    [respond],
  );

  /**
   * Gửi lại prompt user NGAY TRƯỚC message assistant thứ `index` — không phải copy nội dung
   * assistant. Trả `undefined` khi không tìm được prompt (message đầu tiên là assistant) để
   * `AgentMessage` ẩn nút thay vì hiện nút bấm không có tác dụng.
   */
  const makeResendHandler = useCallback(
    (index: number): (() => void) | undefined => {
      for (let i = index - 1; i >= 0; i--) {
        const candidate = messages[i];
        if (candidate?.role !== "user") {
          continue;
        }
        const prompt = candidate.parts
          .filter((part) => part.type === "text")
          .map((part) => (part.type === "text" ? part.text : ""))
          .join("\n\n")
          .trim();
        if (prompt === "") {
          return undefined;
        }
        return () => send(prompt);
      }
      return undefined;
    },
    [messages, send],
  );

  return (
    // `min-h-0` + `overflow-hidden`: chốt vùng chat trong khung cha (panel `h-svh` hoặc trang
    // `/ai`), để phần cuộn nằm ở `Conversation` chứ không đẩy dài container ngoài.
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {header}
      {/* `relative`: composer nổi (absolute) neo theo khung này — xem `composer.tsx`. `pb-*` chừa
          chỗ cho composer đè lên, để tin nhắn cuối không bị khuất dưới bubble input. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <Conversation>
          <ConversationContent className="pb-32">
            {showMessages ? (
              messages.map((message, index) => (
                <AgentMessage
                  canRespond={canRespond}
                  isActive={isActiveTurn && isAssistantStreaming(message)}
                  isStreaming={isStreaming && isAssistantStreaming(message)}
                  key={message.id}
                  message={message}
                  onInputResponses={handleInputResponses}
                  onResend={message.role === "assistant" ? makeResendHandler(index) : undefined}
                  turnEnded={turnEnded}
                  turnStartedAt={turnStartedAt}
                />
              ))
            ) : (
              <AiEmptyState onSelectSuggestion={send} />
            )}
            {showPendingTurn && <PendingAssistantTurn turnStartedAt={turnStartedAt} />}
          </ConversationContent>
          {/* `bottom-36`: đẩy nút "xuống cuối" lên trên bubble composer đang nổi, nếu không nó
              nằm đúng dưới lớp composer và không bấm được. */}
          <ConversationScrollButton className="bottom-36" />
        </Conversation>
        <div className="pointer-events-none absolute inset-x-0 bottom-0">
          {cancelStuck && (
            <div className="pointer-events-auto mx-auto mb-2 flex w-full max-w-3xl items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs backdrop-blur-sm">
              <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              <p className="flex-1 text-muted-foreground">
                Không dừng được tác vụ. Hãy bắt đầu chat mới để tiếp tục làm việc.
              </p>
              <Button onClick={newChat} size="sm" variant="outline">
                Bắt đầu chat mới
              </Button>
            </div>
          )}
          <div className="pointer-events-auto">
            <AiComposer error={error} onSend={send} onStop={stop} status={status} />
          </div>
        </div>
      </div>
    </div>
  );
}
