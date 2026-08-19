/**
 * AI Chat — nhãn thời lượng lượt trả lời ("Đã xử lý trong N giây").
 *
 * VÌ SAO CÓ FILE NÀY (bug 18/08): staff báo "suy nghĩ khá lâu nhưng trả lời xong báo xử lý có 1
 * giây". Gốc rễ nằm ở `ChatPanel`: nó suy "message nào đang chạy" bằng vị trí cuối mảng, nhưng store
 * eve set `status: "submitted"` và notify NGAY khi bấm gửi, còn optimistic user message chỉ được
 * thêm SAU `await prepareSend()`. Trong cửa sổ đó message cuối vẫn là message assistant ĐÃ XONG của
 * lượt trước ⇒ nó bị đánh dấu "đang chạy" một nhịp, và cú flip true→false đó khiến nhãn thời lượng
 * của nó bị tính lại từ mốc lượt MỚI → ghi đè "17 giây" thành "1 giây".
 *
 * Hai tầng test tương ứng hai tầng trách nhiệm:
 * - `ChatPanel` — message đã `complete` KHÔNG BAO GIỜ được đánh dấu đang chạy (guard cho gốc rễ).
 * - `AssistantHeader` — tổng đo từ MỐC LƯỢT (không phải lúc component mount) và không tự đổi khi
 *   `turnStartedAt` nhận mốc của lượt sau.
 */

import type { ReactNode } from "react";

import { act, render, screen } from "@testing-library/react";
import type { EveMessage } from "eve/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssistantHeader } from "@/components/ai-chat/assistant-header";
import { ChatPanel } from "@/components/ai-chat/chat-panel";

// `Shimmer` chạy animation vô hạn qua `motion/react` (requestAnimationFrame) — với fake timers nó
// chỉ thêm tick vô nghĩa vào mỗi lần `advanceTimersByTime`. Nội dung cần assert là CHỮ, nên thay
// bằng `<span>` trần.
vi.mock("@/components/ai-elements/shimmer", () => ({
  Shimmer: ({ children }: { children: string }) => <span>{children}</span>,
}));

/** Mốc bắt đầu lượt đầu tiên — số cố định để mọi phép trừ trong test là tường minh. */
const TURN_1_STARTED_AT = 1_700_000_000_000;
const MS_IN_S = 1000;

type PanelStatus = "error" | "ready" | "streaming" | "submitted";

/** State agent mà `ChatPanel` đọc — test điều khiển trực tiếp qua đây. */
const panelState: { messages: readonly EveMessage[]; status: PanelStatus } = {
  messages: [],
  status: "ready",
};

// Mock ở tầng context (không phải tầng `useEveAgent`): `ChatPanel` chỉ đọc `messages` + `status`, nên
// đây là bề mặt hẹp nhất để dựng đúng tình huống lỗi mà không cần session eve thật.
vi.mock("@/components/ai-panel/ai-panel-provider", () => ({
  useAiPanel: () => ({
    state: { ...panelState, error: undefined, cancelStuck: false },
    actions: {
      send: vi.fn(),
      respond: vi.fn(),
      stop: vi.fn(),
      newChat: vi.fn(),
    },
  }),
}));

// Lần render đầu luôn là empty state (lịch sử chỉ đổ sau khi hydrate — xem `chat-panel.tsx`); nó kéo
// theo `usePathname` + `ConversationEmptyState`, đều không liên quan tới nhãn thời lượng.
vi.mock("@/components/ai-chat/empty-state", () => ({
  AiEmptyState: () => null,
}));

// `internal-steps` (nằm trong cây `AgentMessage`) đọc `@/env` — schema đó validate biến build-time
// của Next và throw khi thiếu. Test này không kiểm tra gì về env nên cấp thẳng cờ debug tool = tắt.
vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_AI_CHAT_DEBUG: "false" },
}));

// Composer kéo theo cả form + upload + shortcut; không liên quan tới nhãn thời lượng.
vi.mock("@/components/ai-chat/composer", () => ({
  AiComposer: () => null,
}));

// `Conversation` dùng `use-stick-to-bottom` (đo scroll height — jsdom không có layout thật).
vi.mock("@/components/ai-elements/conversation", () => ({
  Conversation: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ConversationContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ConversationScrollButton: () => null,
}));

function assistantMessage(turnId: string, status: "complete" | "streaming", text: string): EveMessage {
  return {
    id: `${turnId}:assistant`,
    metadata: { status, turnId },
    parts: [{ type: "text", state: status === "streaming" ? "streaming" : "done", text }],
    role: "assistant",
  };
}

function userMessage(turnId: string, text: string): EveMessage {
  return {
    id: `${turnId}:user`,
    metadata: { status: "complete", turnId },
    parts: [{ type: "text", state: "done", text }],
    role: "user",
  };
}

describe("AssistantHeader — nhãn thời lượng", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TURN_1_STARTED_AT);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("đếm giây từ mốc lượt, không từ lúc component mount", () => {
    // Message assistant chỉ xuất hiện SAU khi server trả part đầu — ở đây là giây thứ 12. Nhãn phải
    // hiện 12 giây (tính từ mốc lượt), không phải 0 giây.
    vi.setSystemTime(TURN_1_STARTED_AT + 12 * MS_IN_S);
    render(<AssistantHeader hasText={true} isActive={true} turnStartedAt={TURN_1_STARTED_AT} />);

    expect(screen.getByText(/Đang trả lời… 12 giây/)).toBeInTheDocument();
  });

  it("chốt tổng thời gian thật của lượt khi lượt kết thúc", () => {
    const view = render(<AssistantHeader hasText={false} isActive={true} turnStartedAt={TURN_1_STARTED_AT} />);

    act(() => {
      vi.advanceTimersByTime(17 * MS_IN_S);
    });
    expect(screen.getByText(/Đang suy nghĩ… 17 giây/)).toBeInTheDocument();

    // Lượt xong: `isActive` tắt. `turnStartedAt` giữ nguyên mốc lượt vừa chạy.
    view.rerender(<AssistantHeader hasText={true} isActive={false} turnStartedAt={TURN_1_STARTED_AT} />);

    expect(screen.getByText(/Đã xử lý trong 17 giây/)).toBeInTheDocument();
  });

  it("KHÔNG ghi đè tổng đã chốt khi lượt kế tiếp bắt đầu (regression 18/08)", () => {
    const view = render(<AssistantHeader hasText={false} isActive={true} turnStartedAt={TURN_1_STARTED_AT} />);

    act(() => {
      vi.advanceTimersByTime(17 * MS_IN_S);
    });
    view.rerender(<AssistantHeader hasText={true} isActive={false} turnStartedAt={TURN_1_STARTED_AT} />);
    expect(screen.getByText(/Đã xử lý trong 17 giây/)).toBeInTheDocument();

    // Staff gửi câu tiếp theo: `ChatPanel` đặt mốc mới. Message này đã xong nên `isActive` PHẢI ở
    // false — nhãn 17 giây không được đổi.
    const turn2StartedAt = TURN_1_STARTED_AT + 20 * MS_IN_S;
    vi.setSystemTime(turn2StartedAt);
    view.rerender(<AssistantHeader hasText={true} isActive={false} turnStartedAt={turn2StartedAt} />);

    expect(screen.getByText(/Đã xử lý trong 17 giây/)).toBeInTheDocument();
    expect(screen.queryByText(/Đã xử lý trong 1 giây/)).not.toBeInTheDocument();
  });

  it("không hiện nhãn nào cho message chưa từng chạy trong lượt hiện tại", () => {
    // Message assistant của lượt trước (resume từ storage, hoặc đang có lượt khác chạy): chưa bao
    // giờ `isActive` ⇒ không có gì để chốt, tuyệt đối không được suy ra con số nào.
    render(<AssistantHeader hasText={true} isActive={false} turnStartedAt={TURN_1_STARTED_AT} />);

    expect(screen.queryByText(/Đã xử lý trong/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Đang suy nghĩ/)).not.toBeInTheDocument();
  });
});

describe("ChatPanel — message nào được coi là đang chạy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TURN_1_STARTED_AT);
    panelState.messages = [];
    panelState.status = "ready";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("giữ nguyên tổng thời lượng của lượt trước khi lượt mới bắt đầu (regression 18/08)", () => {
    // ── Lượt 1: đang chạy ────────────────────────────────────────────────────────────────────
    panelState.messages = [userMessage("turn-1", "Jackpot bao nhiêu?"), assistantMessage("turn-1", "streaming", "…")];
    panelState.status = "streaming";
    const view = render(<ChatPanel header={null} />);

    act(() => {
      vi.advanceTimersByTime(17 * MS_IN_S);
    });

    // ── Lượt 1 xong ──────────────────────────────────────────────────────────────────────────
    panelState.messages = [
      userMessage("turn-1", "Jackpot bao nhiêu?"),
      assistantMessage("turn-1", "complete", "2.002.181.200 VND"),
    ];
    panelState.status = "ready";
    view.rerender(<ChatPanel header={null} />);
    expect(screen.getByText(/Đã xử lý trong 17 giây/)).toBeInTheDocument();

    // ── Staff gửi câu tiếp theo ──────────────────────────────────────────────────────────────
    // Đây là cửa sổ gây bug: store eve đã set `status: "submitted"` nhưng optimistic user message
    // CHƯA được thêm ⇒ `messages` vẫn y nguyên của lượt 1, message cuối là assistant đã xong.
    vi.setSystemTime(TURN_1_STARTED_AT + 20 * MS_IN_S);
    panelState.status = "submitted";
    view.rerender(<ChatPanel header={null} />);

    expect(screen.getByText(/Đã xử lý trong 17 giây/)).toBeInTheDocument();
    expect(screen.queryByText(/Đã xử lý trong 1 giây/)).not.toBeInTheDocument();
  });

  it("vẫn hiện chỗ đứng của Mira trong cửa sổ chưa có message nào của lượt mới", () => {
    panelState.messages = [
      userMessage("turn-1", "Jackpot bao nhiêu?"),
      assistantMessage("turn-1", "complete", "2.002.181.200 VND"),
    ];
    panelState.status = "submitted";
    render(<ChatPanel header={null} />);

    act(() => {
      vi.advanceTimersByTime(3 * MS_IN_S);
    });

    // Lượt mới đã bắt đầu nhưng chưa có message nào ⇒ phải có đồng hồ đang chạy, nếu không panel im
    // lặng hoàn toàn đúng lúc staff sốt ruột nhất.
    expect(screen.getByText(/Đang suy nghĩ… 3 giây/)).toBeInTheDocument();
  });

  it("đánh dấu đang chạy theo `metadata.status`, không theo vị trí cuối mảng", () => {
    // Lượt mới đã có optimistic user message, message assistant lượt trước KHÔNG còn ở cuối nhưng
    // cũng không được coi là đang chạy — chỉ có đúng MỘT đồng hồ trên màn hình.
    panelState.messages = [
      userMessage("turn-1", "Jackpot bao nhiêu?"),
      assistantMessage("turn-1", "complete", "2.002.181.200 VND"),
      userMessage("turn-2", "Bạn có thể giúp được gì"),
    ];
    panelState.status = "submitted";
    render(<ChatPanel header={null} />);

    act(() => {
      vi.advanceTimersByTime(5 * MS_IN_S);
    });

    expect(screen.getAllByText(/Đang suy nghĩ… 5 giây/)).toHaveLength(1);
    expect(screen.queryByText(/Đã xử lý trong/)).not.toBeInTheDocument();
  });
});
