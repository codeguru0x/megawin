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
import { useCallback, useEffect, useRef, useState } from "react";

import type { EveMessage } from "eve/react";
import { AlertTriangleIcon } from "lucide-react";

import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";

import { useAiPanel } from "../ai-panel/ai-panel-provider";
import { AssistantHeader } from "./assistant-header";
import type { AiComposerHandle } from "./composer";
import { AiComposer } from "./composer";
import { AiEmptyState } from "./empty-state";
import type { AgentInputResponseInput } from "./render-message";
import { AgentMessage } from "./render-message";

/**
 * Ảnh chụp message assistant cuối cùng tại ĐÚNG lúc một lượt bắt đầu.
 *
 * Đây là mốc để phân biệt "message assistant của lượt ĐANG chạy" với "message assistant đã xong của
 * lượt TRƯỚC" — hai thứ không thể phân biệt được bằng bất kỳ field nào trên chính message (xem
 * {@link resolveActiveAssistantId}).
 */
interface TurnBaseline {
  /** `id` của message assistant cuối lúc lượt bắt đầu; `undefined` khi hội thoại chưa có message nào. */
  assistantId: string | undefined;
  /** Số part của message đó lúc lượt bắt đầu — dùng cho ca HITL resume (cùng `id`, part mọc thêm). */
  partCount: number;
}

/**
 * `id` của message assistant thuộc lượt ĐANG chạy, `undefined` khi lượt chưa sinh message nào.
 *
 * ⚠️ TUYỆT ĐỐI KHÔNG suy bằng `metadata.status === "streaming"` (bug 18/08 → 19/08). `status` của
 * message KHÔNG phải cờ mức LƯỢT: reducer eve tính lại nó theo part vừa upsert
 * (`node_modules/eve/dist/src/client/message-reducer.js` — `upsertRun`/`upsertPart`:
 * `status = next.type === "text" && next.state === "done" ? "complete" : "streaming"`). Chạy thật
 * reducer của eve với một lượt nhiều bước cho ra chuỗi:
 *
 * ```
 * step.started(0)        -> streaming
 * message.appended(0)    -> streaming
 * message.completed(0)   -> complete    ← lượt VẪN đang chạy
 * reasoning.appended(1)  -> streaming
 * message.completed(2)   -> complete
 * turn.completed         -> complete
 * ```
 *
 * Nghĩa là mỗi lần Mira viết xong MỘT đoạn text giữa lượt (rất thường xuyên: nói một câu rồi mới
 * gọi tool), `status` nhảy sang `"complete"` rồi lại về `"streaming"`. Hệ quả đã thấy trên UI:
 * đồng hồ chốt "Đã xử lý trong N giây" giữa lúc còn đang trả lời (đọc như câu trả lời bị ĐỨT), một
 * khối "Mira · Đang suy nghĩ… 0 giây" RỖNG mọc ra dưới câu trả lời (đọc như mất message mới nhất,
 * còn nội dung thì "trả lời ở message trước đó"), và nhấp nháy liên tục theo từng đoạn text.
 *
 * KHÔNG suy bằng "là message cuối mảng" được nữa (bug 18/08): store eve set `status: "submitted"`
 * rồi notify subscriber NGAY khi staff bấm gửi, nhưng optimistic user message chỉ được thêm SAU
 * `await prepareSend()`. Trong cửa sổ đó `messages` vẫn nguyên của lượt trước ⇒ message cuối là
 * message assistant ĐÃ XONG của lượt trước, bị đánh dấu "đang chạy" vài ms và nhãn thời lượng của
 * nó bị tính lại từ mốc lượt mới ("17 giây" → "1 giây").
 *
 * Cách duy nhất đứng vững cho cả hai: so với {@link TurnBaseline} chụp lúc lượt bắt đầu.
 * - `id` khác baseline ⇒ message của lượt mới (ca thường).
 * - `id` trùng nhưng số part TĂNG ⇒ lượt HITL resume ghi tiếp vào message cũ (`respond()` nối lại
 *   đúng tool call đang chờ nên eve giữ nguyên message), vẫn phải coi là đang chạy.
 * - `id` trùng và part không tăng ⇒ đúng là message của lượt trước, KHÔNG đang chạy.
 * - `baseline === null` ⇒ không quan sát được cú chuyển vào lượt (panel mount khi lượt đã chạy),
 *   message assistant cuối chính là của lượt đó.
 */
function resolveActiveAssistantId(
  messages: readonly EveMessage[],
  isActiveTurn: boolean,
  baseline: TurnBaseline | null,
): string | undefined {
  if (!isActiveTurn) {
    return undefined;
  }
  const lastAssistant = messages.findLast((message) => message.role === "assistant");
  if (lastAssistant === undefined) {
    return undefined;
  }
  if (baseline === null) {
    return lastAssistant.id;
  }
  const isNewMessage = lastAssistant.id !== baseline.assistantId;
  const hasGrown = lastAssistant.parts.length > baseline.partCount;
  return isNewMessage || hasGrown ? lastAssistant.id : undefined;
}

/**
 * Chỗ đứng của Mira trong lúc server chưa trả part nào.
 *
 * Chỉ có ĐÚNG hàng header của message assistant thật (`AssistantHeader`) kèm `LiveDot` — không thân,
 * không placeholder. Khi message thật tới, hàng header không nhảy chỗ, chữ chỉ hiện thêm bên dưới.
 * Trước đây chỗ này là dòng chữ đếm giây, sau đó là một dot ở vùng thân; xem `assistant-header.tsx`
 * cho lý do bỏ cả hai (con số làm staff sốt ruột; dot ở thân đứng lơ lửng như bullet lỗi).
 */
function PendingAssistantTurn({ turnStartedAt }: { turnStartedAt: number | null }) {
  return (
    <Message from="assistant">
      <AssistantHeader isActive={true} turnStartedAt={turnStartedAt} />
    </Message>
  );
}

/**
 * App đã qua lần hydrate đầu tiên chưa — module-level nên sống xuyên các lần mount `ChatPanel`.
 *
 * Gate `hydrated` bên dưới tồn tại để khớp HTML server (server luôn thấy 0 message), nhưng chỉ lần
 * mount ĐẦU của app mới có HTML server để khớp. Các lần mount sau đều là điều hướng client-side
 * (panel → `/ai`, đổi thread) — ở đó gate chỉ tạo thêm một nhịp render empty state rồi mới đổ lịch
 * sử, tức một cú NHÁY hội thoại đúng lúc staff vừa bấm "Mở rộng" (sửa 19/08).
 *
 * Cờ ở module scope (không state/ref) vì đây là tính chất của LẦN TẢI TRANG, không của instance —
 * xem `vercel-react-best-practices` §8.1 "Initialize App Once, Not Per Mount".
 */
let appHasHydrated = false;

export function ChatPanel({ header }: { header: ReactNode }) {
  const {
    state: { messages, status, error, cancelStuck },
    actions: { send, respond, stop, newChat },
  } = useAiPanel();

  // Lịch sử chat được resume từ `sessionStorage` (chỉ tồn tại ở client) — render nó ngay lần render
  // đầu sẽ lệch với HTML server → hydration mismatch. Lần render đầu ở client cố tình hiển thị empty
  // state y như server, rồi mới đổ lịch sử. Mount thứ hai trở đi bỏ qua gate (xem `appHasHydrated`).
  const [hydrated, setHydrated] = useState(() => appHasHydrated);
  useEffect(() => {
    appHasHydrated = true;
    setHydrated(true);
  }, []);

  // eve 0.45+: `"resuming"` = catch-up session — chặn respond/input như lúc busy, nhưng chưa là active turn.
  const canRespond = status === "ready" || status === "error";
  const isStreaming = status === "streaming";
  const isActiveTurn = status === "submitted" || status === "streaming";
  // Turn đã kết thúc ⇒ mọi tool part chưa có output là MỒ CÔI, không thể chạy tiếp (p0-04 §3.2).
  const turnEnded = status === "ready" || status === "error";
  const showMessages = hydrated && messages.length > 0;

  // Mốc bắt đầu lượt, dùng để chốt "Đã xử lý trong N giây" khi lượt kết thúc.
  //
  // GIỮ Ở ĐÂY (không ở `AssistantHeader`) vì lượt bắt đầu TRƯỚC khi message assistant tồn tại: đo
  // từ lúc message xuất hiện sẽ hụt 1-3 giây đầu. Chỉ là mốc số, không tick — sau khi bỏ đồng hồ
  // đếm lên (19/08) toàn bộ lượt KHÔNG còn re-render theo giây ở bất kỳ tầng nào.
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
  // Ảnh chụp message assistant cuối tại đúng lúc lượt bắt đầu — mốc so sánh của
  // `resolveActiveAssistantId`. Dùng ref (không state) để cập nhật ngay trong cùng render lượt mới,
  // tránh một render trung gian mà baseline còn là của lượt trước.
  const turnBaselineRef = useRef<TurnBaseline | null>(null);
  const wasActiveTurnRef = useRef(false);
  // `undefined` = render đầu tiên (ref chưa được gán lần nào). Không dùng `useRef(true)`: Biome hẹp
  // type về literal `true` và báo `noUnnecessaryConditions`.
  const hasRenderedRef = useRef<boolean | undefined>(undefined);
  // Cửa ghi vào composer cho nút "Hỏi lại câu này" trên message assistant — xem `AiComposerHandle`.
  const composerRef = useRef<AiComposerHandle>(null);
  if (isActiveTurn && !wasActiveTurnRef.current) {
    const lastAssistant = messages.findLast((message) => message.role === "assistant");
    // Render ĐẦU mà đã ở giữa lượt (không quan sát được cú chuyển ready→active): không có gì để
    // chụp làm mốc, đây là chỗ DUY NHẤT `metadata.status` còn dùng được — nó là thông tin tốt nhất
    // tại một ảnh chụp tĩnh. Nó chỉ sai khi bị đọc LIÊN TỤC giữa lượt (bug 19/08), còn ở đây đọc
    // đúng một lần rồi thôi. `streaming` ⇒ message này thuộc lượt đang chạy (baseline `null` để
    // `resolveActiveAssistantId` nhận nó); ngược lại nó là của lượt trước ⇒ chụp làm baseline.
    const isMidTurnMount = hasRenderedRef.current === undefined && lastAssistant?.metadata?.status === "streaming";
    turnBaselineRef.current = isMidTurnMount
      ? null
      : { assistantId: lastAssistant?.id, partCount: lastAssistant?.parts.length ?? 0 };
  }
  wasActiveTurnRef.current = isActiveTurn;
  hasRenderedRef.current = true;

  useEffect(() => {
    // CHỈ đặt mốc khi vào lượt mới, KHÔNG reset về `null` khi lượt xong: `AssistantHeader` của
    // message vừa xong vẫn cần mốc này để chốt tổng thời gian. Reset ở đây làm nó rơi vào nhánh
    // fallback `Date.now()` và ra "1 giây" cho mọi lượt (bug 18/08).
    if (isActiveTurn) {
      setTurnStartedAt(Date.now());
    }
  }, [isActiveTurn]);

  // `id` của message assistant thuộc lượt đang chạy — nguồn duy nhất quyết định message nào được
  // gắn cờ active/streaming. Xem `resolveActiveAssistantId` cho lý do không dùng `metadata.status`.
  const activeAssistantId = resolveActiveAssistantId(messages, isActiveTurn, turnBaselineRef.current);

  // Lượt đang chạy nhưng chưa sinh message assistant nào ⇒ render chỗ đứng của Mira, nếu không
  // panel im lặng hoàn toàn (đặc biệt sau khi đã ẩn card tool khỏi hội thoại).
  const showPendingTurn = isActiveTurn && activeAssistantId === undefined;

  const handleInputResponses = useCallback(
    (responses: readonly AgentInputResponseInput[]) => {
      void respond(responses).catch((responseError: unknown) => {
        console.error("[ai-panel] trả lời input request thất bại", responseError);
      });
    },
    [respond],
  );

  /**
   * Nạp câu hỏi user NGAY TRƯỚC message assistant thứ `index` xuống ô nhập — không phải copy nội
   * dung assistant. Trả `undefined` khi không tìm được câu hỏi (message đầu hội thoại là assistant)
   * để `AgentMessage` ẩn nút thay vì hiện nút bấm không có tác dụng.
   *
   * KHÔNG gửi thẳng (đổi 24/08): xem {@link AgentMessage} prop `onReuseQuestion` cho lý do đầy đủ.
   * Tóm lại — staff bấm nút này phần lớn vì câu hỏi CŨ thiếu ý, nên bước hữu ích là mang chữ xuống ô
   * nhập; muốn gửi nguyên văn thì chỉ cần bấm gửi thêm một nhịp.
   */
  const makeReuseQuestionHandler = useCallback(
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
        return () => composerRef.current?.loadDraft(prompt);
      }
      return undefined;
    },
    [messages],
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
              messages.map((message, index) => {
                // Flatten part assistant trước message này — `renderChart` follow-up cần dò bảng
                // đã tra ở lượt cũ (cùng hội thoại, không cùng message).
                const earlierAssistantParts = messages
                  .slice(0, index)
                  .filter((prior) => prior.role === "assistant")
                  .flatMap((prior) => prior.parts);
                return (
                  <AgentMessage
                    canRespond={canRespond}
                    earlierAssistantParts={earlierAssistantParts}
                    isActive={message.id === activeAssistantId}
                    isStreaming={isStreaming && message.id === activeAssistantId}
                    key={message.id}
                    message={message}
                    onInputResponses={handleInputResponses}
                    onReuseQuestion={message.role === "assistant" ? makeReuseQuestionHandler(index) : undefined}
                    turnEnded={turnEnded}
                    turnStartedAt={turnStartedAt}
                  />
                );
              })
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
            <AiComposer error={error} onSend={send} onStop={stop} ref={composerRef} status={status} />
          </div>
        </div>
      </div>
    </div>
  );
}
