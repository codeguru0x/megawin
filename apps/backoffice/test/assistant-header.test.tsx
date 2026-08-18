/**
 * AI Chat — `AssistantHeader`: nhãn thời lượng lượt trả lời.
 *
 * VÌ SAO CÓ FILE NÀY (bug 18/08): staff báo "suy nghĩ khá lâu nhưng trả lời xong báo xử lý có 1
 * giây". Nguyên nhân là message assistant ĐÃ XONG bị đánh dấu `isActive` một nhịp nữa khi lượt kế
 * tiếp bắt đầu — nhánh chốt tổng chạy lại với mốc của lượt mới và ghi đè con số đúng thành 1 giây.
 * Test này khoá hai tính chất: tổng đo từ MỐC LƯỢT (không phải lúc component mount), và tổng đã
 * chốt KHÔNG bị đổi khi `turnStartedAt` nhận mốc của lượt sau.
 */

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssistantHeader } from "@/components/ai-chat/assistant-header";

// `Shimmer` chạy animation vô hạn qua `motion/react` (requestAnimationFrame) — với fake timers nó
// chỉ thêm tick vô nghĩa vào mỗi lần `advanceTimersByTime`. Nội dung cần assert là CHỮ, nên thay
// bằng `<span>` trần.
vi.mock("@/components/ai-elements/shimmer", () => ({
  Shimmer: ({ children }: { children: string }) => <span>{children}</span>,
}));

/** Mốc bắt đầu lượt đầu tiên — số cố định để mọi phép trừ trong test là tường minh. */
const TURN_1_STARTED_AT = 1_700_000_000_000;
const MS_IN_S = 1000;

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
