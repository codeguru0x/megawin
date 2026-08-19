/**
 * Command palette `⌘J` — đường từ "gõ câu hỏi" sang "chat với Mira".
 *
 * VÌ SAO CÓ FILE NÀY (bug 19/08): palette mở ra với item "Hỏi Mira về trang này" được chọn sẵn,
 * nhưng vừa gõ nội dung là item đó **biến mất** — `cmdk` filter mọi `CommandItem` theo text của
 * chính nó, và "Hỏi Mira về trang này" không khớp câu hỏi staff gõ ("doanh thu keno hôm nay"). Kết
 * quả: staff gõ xong không có cách nào chuyển nội dung vừa gõ sang Mira, phải mở panel rồi gõ lại.
 *
 * Hai tính chất phải CÙNG đúng, và chúng kéo nhau về hai phía ngược nhau — đó là lý do phải khoá
 * bằng test chứ không chỉ bằng comment:
 * - Item AI **không bao giờ bị filter ẩn** (score dương cố định) ⇒ luôn có đường sang Mira.
 * - Item AI **không được chiếm Enter** khi có trang khớp (score nhỏ hơn mọi score thật ⇒ luôn sort
 *   xuống cuối) — palette + 2 ký tự vẫn phải là đường điều hướng nhanh nhất (xem `p1-04` §5).
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchDialog } from "@/components/sidebar/search-dialog";

const setAiPanelOpen = vi.fn();
const sendToAi = vi.fn();
const routerPush = vi.fn();
/** Route đang xem — chỉ đổi ở case "/ai" (panel không được mở thêm ở đó). */
let currentPathname = "/dashboard";

vi.mock("@/components/ai-panel/ai-panel-provider", () => ({
  useAiPanel: () => ({
    actions: { setOpen: setAiPanelOpen, send: sendToAi },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
  usePathname: () => currentPathname,
}));

// Palette lọc entry theo role của user đang đăng nhập; test này không kiểm tra role gating nên cấp
// role cao nhất để mọi entry sidebar/registry đều hiện (cần có entry thật để kiểm phần sort).
vi.mock("@/hooks/use-user-roles", () => ({
  useUserRoles: () => ["super"],
}));

/** Mở palette bằng đúng phím tắt thật (`⌘J`) — không gọi setState nội bộ. */
async function openPalette(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard("{Meta>}j{/Meta}");
  return screen.getByRole("combobox");
}

/**
 * `cmdk` đo chiều cao list bằng `ResizeObserver` (jsdom không có). Stub no-op: test này chỉ kiểm
 * hành vi chọn/gửi, không kiểm layout.
 */
class ResizeObserverStub {
  observe() {
    // no-op: jsdom không có layout thật để quan sát.
  }
  unobserve() {
    // no-op
  }
  disconnect() {
    // no-op
  }
}

describe("SearchDialog — Hỏi Mira", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    // jsdom không implement `scrollIntoView` (cmdk gọi khi đổi item được chọn).
    Element.prototype.scrollIntoView = vi.fn();
    currentPathname = "/dashboard";
    setAiPanelOpen.mockClear();
    sendToAi.mockClear();
    routerPush.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("mở bằng ⌘J: item Hỏi Mira hiện và được chọn sẵn", async () => {
    const user = userEvent.setup();
    render(<SearchDialog />);

    await openPalette(user);

    const askItem = screen.getByRole("option", { name: /Hỏi Mira về trang này/ });
    expect(askItem).toHaveAttribute("aria-selected", "true");
  });

  it("gõ câu hỏi không khớp trang nào: item Hỏi Mira VẪN hiện, Enter gửi đúng nội dung cho Mira", async () => {
    const user = userEvent.setup();
    render(<SearchDialog />);

    const input = await openPalette(user);
    await user.type(input, "doanh thu keno hôm nay");

    // Chính là hồi quy của bug: trước đây item này bị `cmdk` filter ẩn hoàn toàn.
    const askItem = screen.getByRole("option", { name: /Hỏi Mira/ });
    expect(askItem).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Enter}");

    expect(sendToAi).toHaveBeenCalledWith("doanh thu keno hôm nay");
    expect(setAiPanelOpen).toHaveBeenCalledWith(true);
    // Không được điều hướng: staff đang hỏi, không đang tìm trang.
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("gõ từ khoá khớp trang: Enter ĐIỀU HƯỚNG, không gửi cho Mira", async () => {
    const user = userEvent.setup();
    render(<SearchDialog />);

    const input = await openPalette(user);
    // "Tài chính" là entry thật trong nav (nhóm Báo cáo) — khớp mạnh nên phải giữ quyền chọn mặc định.
    await user.type(input, "tài chính");

    const options = screen.getAllByRole("option");
    const firstOption = options[0];
    expect(firstOption).toHaveAttribute("aria-selected", "true");
    // Chính là tính chất dễ vỡ nhất: item AI vẫn phải CÓ trong danh sách, nhưng KHÔNG được đứng
    // trước trang khớp (nó chỉ đứng cuối nhờ vị trí DOM — cmdk không sort group, xem `SearchDialog`).
    expect(firstOption?.textContent).not.toMatch(/Hỏi Mira/);
    expect(options.at(-1)?.textContent).toMatch(/Hỏi Mira/);

    await user.keyboard("{Enter}");

    expect(routerPush).toHaveBeenCalled();
    expect(sendToAi).not.toHaveBeenCalled();
  });

  it("mở palette khi chưa gõ gì: chỉ mở panel, không gửi tin nhắn rỗng", async () => {
    const user = userEvent.setup();
    render(<SearchDialog />);

    await openPalette(user);
    await user.keyboard("{Enter}");

    expect(setAiPanelOpen).toHaveBeenCalledWith(true);
    expect(sendToAi).not.toHaveBeenCalled();
  });

  it("đang ở /ai: gửi câu hỏi nhưng KHÔNG mở panel (trang đó đã là bề mặt chat)", async () => {
    currentPathname = "/ai";
    const user = userEvent.setup();
    render(<SearchDialog />);

    const input = await openPalette(user);
    await user.type(input, "doanh thu keno hôm nay");
    await user.keyboard("{Enter}");

    expect(sendToAi).toHaveBeenCalledWith("doanh thu keno hôm nay");
    expect(setAiPanelOpen).not.toHaveBeenCalled();
  });

  it("đóng rồi mở lại: query cũ không còn sót lại", async () => {
    const user = userEvent.setup();
    render(<SearchDialog />);

    const input = await openPalette(user);
    await user.type(input, "doanh thu keno hôm nay");
    await user.keyboard("{Enter}");

    const reopenedInput = await openPalette(user);
    expect(reopenedInput).toHaveValue("");
    expect(screen.getByRole("option", { name: /Hỏi Mira về trang này/ })).toBeInTheDocument();
  });
});
