/**
 * AI Chat — tín hiệu trạng thái lượt trả lời: dot "live" khi đang chạy, "Đã xử lý trong N giây" khi xong.
 *
 * VÌ SAO CÓ FILE NÀY — ba lần sửa thật, ba gốc rễ khác nhau, cùng đập vào một dòng UI:
 *
 * - **18/08** "suy nghĩ khá lâu nhưng trả lời xong báo xử lý có 1 giây". `ChatPanel` suy "message nào
 *   đang chạy" bằng vị trí cuối mảng, nhưng store eve set `status: "submitted"` và notify NGAY khi
 *   bấm gửi, còn optimistic user message chỉ được thêm SAU `await prepareSend()`. Trong cửa sổ đó
 *   message cuối vẫn là message assistant ĐÃ XONG của lượt trước ⇒ nó bị đánh dấu "đang chạy" một
 *   nhịp, và cú flip true→false đó khiến nhãn thời lượng bị tính lại từ mốc lượt MỚI.
 * - **19/08 (a)** "trả lời hay bị đứt, đồng hồ nhảy lung tung / đếm lại từ 0, message mới nhất bị
 *   mất". Bản vá 18/08 chuyển sang suy theo `metadata.status === "streaming"`, nhưng reducer eve tính
 *   status theo PART vừa upsert, không theo lượt: mỗi lần Mira viết xong một đoạn text giữa lượt,
 *   status nhảy `complete` rồi lại `streaming`. Mỗi cú nhảy chốt tổng sớm + mọc thêm một khối Mira rỗng.
 * - **19/08 (b)** "đồng hồ đếm lên khiến cảm giác chờ rất sốt ruột". Bỏ hẳn chữ + số giây trong lúc
 *   chạy, thay bằng dot nhấp nháy (`ai-elements/live-indicator.tsx`); con số chỉ chốt MỘT LẦN sau khi
 *   xong. Vì vậy test dưới đây assert tín hiệu đang chạy qua `role="status"`, KHÔNG qua chữ.
 *
 * Cả ba chỉ đứng vững nếu "message nào đang chạy" được suy từ ẢNH CHỤP lúc lượt bắt đầu
 * (`resolveActiveAssistantId`) — hai tầng test dưới đây khoá cả hai tầng trách nhiệm:
 * - `ChatPanel` — message của lượt trước không bao giờ bị đánh dấu đang chạy, message của lượt hiện
 *   tại không bao giờ bị bỏ đánh dấu giữa lượt.
 * - `AssistantHeader` — tổng đo từ MỐC LƯỢT (không phải lúc component mount) và không tự đổi khi
 *   `turnStartedAt` nhận mốc của lượt sau.
 */

import type { ReactNode } from "react";

import { act, render, screen } from "@testing-library/react";
import type { EveMessage } from "eve/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssistantHeader } from "@/components/ai-chat/assistant-header";
import { ChatPanel } from "@/components/ai-chat/chat-panel";
import { AI_ASSISTANT_NAME } from "@/config/app-config";

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
// theo `usePathname` + `ConversationEmptyState`, đều không liên quan tới tín hiệu trạng thái.
vi.mock("@/components/ai-chat/empty-state", () => ({
  AiEmptyState: () => null,
}));

// `internal-steps` (nằm trong cây `AgentMessage`) đọc `@/env` — schema đó validate biến build-time
// của Next và throw khi thiếu. Test này không kiểm tra gì về env nên cấp thẳng cờ debug tool = tắt.
vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_AI_CHAT_DEBUG: "false" },
}));

// Composer kéo theo cả form + upload + shortcut; không liên quan tới tín hiệu trạng thái.
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

describe("AssistantHeader — tín hiệu trạng thái", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TURN_1_STARTED_AT);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("đang chạy: hiện dot live cạnh tên, TUYỆT ĐỐI không hiện số giây (feedback 19/08)", () => {
    // Con số đếm lên trong lúc chờ chính là thứ làm staff sốt ruột — đây là tính chất sản phẩm, không
    // phải chi tiết trình bày, nên khoá bằng test. Dot nằm CÙNG HÀNG với tên trợ lý (đổi lần 3): cùng
    // chỗ mà lát nữa hiện "Đã xử lý trong N giây" ⇒ lượt kết thúc không có gì nhảy chỗ.
    vi.setSystemTime(TURN_1_STARTED_AT + 12 * MS_IN_S);
    render(<AssistantHeader isActive={true} turnStartedAt={TURN_1_STARTED_AT} />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText(/giây/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Đang suy nghĩ|Đang trả lời/)).not.toBeInTheDocument();
  });

  it("chốt tổng thời gian thật của lượt khi lượt kết thúc", () => {
    const view = render(<AssistantHeader isActive={true} turnStartedAt={TURN_1_STARTED_AT} />);

    act(() => {
      vi.advanceTimersByTime(17 * MS_IN_S);
    });

    // Lượt xong: `isActive` tắt. `turnStartedAt` giữ nguyên mốc lượt vừa chạy.
    view.rerender(<AssistantHeader isActive={false} turnStartedAt={TURN_1_STARTED_AT} />);

    expect(screen.getByText(/Đã xử lý trong 17 giây/)).toBeInTheDocument();
    // Dot phải tắt cùng lúc — hai tín hiệu cùng hiện thì staff không biết còn chạy hay đã xong.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("KHÔNG ghi đè tổng đã chốt khi lượt kế tiếp bắt đầu (regression 18/08)", () => {
    const view = render(<AssistantHeader isActive={true} turnStartedAt={TURN_1_STARTED_AT} />);

    act(() => {
      vi.advanceTimersByTime(17 * MS_IN_S);
    });
    view.rerender(<AssistantHeader isActive={false} turnStartedAt={TURN_1_STARTED_AT} />);
    expect(screen.getByText(/Đã xử lý trong 17 giây/)).toBeInTheDocument();

    // Staff gửi câu tiếp theo: `ChatPanel` đặt mốc mới. Message này đã xong nên `isActive` PHẢI ở
    // false — nhãn 17 giây không được đổi.
    const turn2StartedAt = TURN_1_STARTED_AT + 20 * MS_IN_S;
    vi.setSystemTime(turn2StartedAt);
    view.rerender(<AssistantHeader isActive={false} turnStartedAt={turn2StartedAt} />);

    expect(screen.getByText(/Đã xử lý trong 17 giây/)).toBeInTheDocument();
    expect(screen.queryByText(/Đã xử lý trong 1 giây/)).not.toBeInTheDocument();
  });

  it("không hiện nhãn nào cho message chưa từng chạy trong lượt hiện tại", () => {
    // Message assistant của lượt trước (resume từ storage, hoặc đang có lượt khác chạy): chưa bao
    // giờ `isActive` ⇒ không có gì để chốt, tuyệt đối không được suy ra con số nào.
    render(<AssistantHeader isActive={false} turnStartedAt={TURN_1_STARTED_AT} />);

    expect(screen.queryByText(/Đã xử lý trong/)).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
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

    // Lượt mới đã bắt đầu nhưng chưa có message nào ⇒ phải có tín hiệu đang chạy, nếu không panel im
    // lặng hoàn toàn đúng lúc staff sốt ruột nhất. ĐÚNG MỘT `role="status"`: tín hiệu duy nhất là
    // `ThinkingDot` ở vùng nội dung — header không còn dot riêng (đổi 19/08, tránh hai tín hiệu nói
    // cùng một điều ở hai chỗ).
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("đánh dấu đang chạy theo mốc lượt, không theo vị trí cuối mảng", () => {
    // Lượt mới đã có optimistic user message, message assistant lượt trước KHÔNG còn ở cuối nhưng
    // cũng không được coi là đang chạy — message đã xong đó tuyệt đối không được có tín hiệu live.
    panelState.messages = [
      userMessage("turn-1", "Jackpot bao nhiêu?"),
      assistantMessage("turn-1", "complete", "2.002.181.200 VND"),
    ];
    panelState.status = "ready";
    const view = render(<ChatPanel header={null} />);

    panelState.messages = [
      userMessage("turn-1", "Jackpot bao nhiêu?"),
      assistantMessage("turn-1", "complete", "2.002.181.200 VND"),
      userMessage("turn-2", "Bạn có thể giúp được gì"),
    ];
    panelState.status = "submitted";
    view.rerender(<ChatPanel header={null} />);

    // Đúng MỘT tín hiệu đang chạy (dot của `PendingAssistantTurn`), không có tín hiệu thứ hai từ
    // message lượt trước; và message lượt trước không bị chốt lại tổng.
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.queryByText(/Đã xử lý trong/)).not.toBeInTheDocument();
  });

  it("tắt dot NGAY khi chữ đầu tiên chảy xuống, nhưng chưa chốt tổng (feedback 19/08 lần 4)", () => {
    // Chữ đang hiện ra tự nó đã là tín hiệu sống rõ hơn mọi indicator ⇒ giữ dot lúc đó chỉ là nhiễu.
    // Bẫy ở đây: rất dễ "sửa" bằng cách tắt luôn `isActive` khi có chữ — làm vậy thì tổng thời gian bị
    // chốt ngay chữ đầu tiên, đọc như câu trả lời đã xong giữa lúc còn đang chảy. Test khoá cả hai.
    panelState.messages = [userMessage("turn-1", "Jackpot bao nhiêu?")];
    panelState.status = "submitted";
    const view = render(<ChatPanel header={null} />);

    // Chưa có chữ: dot phải có, nếu không panel im lặng hoàn toàn lúc staff chờ.
    expect(screen.getAllByRole("status")).toHaveLength(1);

    panelState.messages = [
      userMessage("turn-1", "Jackpot bao nhiêu?"),
      assistantMessage("turn-1", "streaming", "2.002"),
    ];
    panelState.status = "streaming";
    view.rerender(<ChatPanel header={null} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/Đã xử lý trong/)).not.toBeInTheDocument();
  });

  it("không chốt tổng khi message assistant tạm về `complete` giữa lượt (regression 19/08)", () => {
    // Reducer eve tính `metadata.status` theo part vừa upsert, nên mỗi lần Mira viết XONG một đoạn
    // text giữa lượt (nói một câu rồi mới gọi tool) status nhảy `streaming` → `complete` → `streaming`.
    // Suy "đang chạy" từ status ⇒ chốt "Đã xử lý trong N giây" giữa lúc còn đang trả lời (đọc như
    // câu trả lời bị ĐỨT) và mọc thêm một khối Mira rỗng.
    panelState.messages = [userMessage("turn-1", "Jackpot bao nhiêu?")];
    panelState.status = "submitted";
    const view = render(<ChatPanel header={null} />);

    // Mira viết xong đoạn dẫn — part `done`, status `complete`, nhưng LƯỢT VẪN CHẠY.
    panelState.messages = [
      userMessage("turn-1", "Jackpot bao nhiêu?"),
      assistantMessage("turn-1", "complete", "Để tôi tra."),
    ];
    panelState.status = "streaming";
    view.rerender(<ChatPanel header={null} />);

    act(() => {
      vi.advanceTimersByTime(6 * MS_IN_S);
    });

    // Chưa chốt tổng, và KHÔNG mọc thêm khối Mira thứ hai (`PendingAssistantTurn` không được render
    // vì message của lượt đã được nhận diện đúng là đang chạy).
    expect(screen.queryByText(/Đã xử lý trong/)).not.toBeInTheDocument();
    expect(screen.getAllByText(AI_ASSISTANT_NAME)).toHaveLength(1);
  });

  it("chốt tổng đúng một lần khi lượt thực sự kết thúc", () => {
    panelState.messages = [userMessage("turn-1", "Jackpot bao nhiêu?")];
    panelState.status = "submitted";
    const view = render(<ChatPanel header={null} />);

    panelState.messages = [
      userMessage("turn-1", "Jackpot bao nhiêu?"),
      assistantMessage("turn-1", "streaming", "2.002"),
    ];
    panelState.status = "streaming";
    view.rerender(<ChatPanel header={null} />);

    act(() => {
      vi.advanceTimersByTime(9 * MS_IN_S);
    });

    panelState.messages = [
      userMessage("turn-1", "Jackpot bao nhiêu?"),
      assistantMessage("turn-1", "complete", "2.002.181.200 VND"),
    ];
    panelState.status = "ready";
    view.rerender(<ChatPanel header={null} />);

    expect(screen.getByText(/Đã xử lý trong 9 giây/)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
