/**
 * AI Chat — thẻ `navigateTo`: nhãn thẻ và quyết định auto-navigate.
 *
 * VÌ SAO CÓ FILE NÀY: nhãn thẻ là NGUỒN CHÂN LÝ DUY NHẤT về việc trang đã mở hay chưa
 * (`40-tool-policy.md` cấm model phát biểu điều đó, vì model không biết trước — biến thể panel/`/ai`
 * và trạng thái dirty chỉ có ở client lúc mount). Sai nhãn ⇒ staff đọc "Đã mở" rồi đi tìm một trang
 * chưa mở, hoặc bấm lại thẻ đã mở. Không có tầng nào khác bắt được lỗi đó.
 *
 * Nhánh dirty (19/08) là lý do trực tiếp: nó nằm trong code từ p1-04 §2.3 nhưng KHÔNG BAO GIỜ chạy —
 * quy tắc đọc `formDirty` từ `collectAiPageContext()`, mà **không trang nào ghi khoá đó**. Phần ghi
 * (`useAiFormDirty` ở 40 form config) vừa được nối; test dưới đây khoá cả hai đầu của hợp đồng:
 * - Đầu GHI: `useAiFormDirty` publish đúng khoá `formDirty`, và VẮNG MẶT khi form sạch.
 * - Đầu ĐỌC: thẻ hạ cấp auto-navigate + hiện cảnh báo amber khi có form dirty.
 *
 * PURE — không DB, không network. `buildNavHref` được gọi THẬT (không mock) để href/nhãn trong test
 * luôn khớp registry: hardcode `"/games/keno/operations"` thì đổi `pathTemplate` là test vẫn xanh
 * trong khi UI thật đã hỏng.
 */

import { act, render, renderHook, screen } from "@testing-library/react";
import type { EveDynamicToolPart } from "eve/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderNavigateTo } from "@/components/ai-chat/tool-renderers/navigate-tool-card";
import { AI_FULL_PAGE_PATH } from "@/config/app-config";
import { useAiFormDirty } from "@/hooks/use-ai-form-dirty";
import { collectAiPageContext, registerAiPageContext } from "@/lib/ai-page-context";
import { buildNavHref, NavPage } from "@/lib/nav-registry";

const routerPush = vi.fn();
/** Đường dẫn hiện tại — mỗi test set trước khi render để chọn biến thể panel vs trang `/ai`. */
let currentPathname = "/dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
  useRouter: () => ({ push: routerPush }),
}));

/**
 * Dựng tool part giống hệt shape mà eve đưa vào renderer, với href + nhãn LẤY TỪ REGISTRY THẬT.
 *
 * `autoNavigate` truyền tay (không đọc từ registry) vì test cần cả hai giá trị trên cùng một trang:
 * ý nghĩa cần khoá là "thẻ xử lý cờ này thế nào", không phải "trang X có cờ gì".
 */
function navigateToPart(autoNavigate: boolean): EveDynamicToolPart {
  const built = buildNavHref(NavPage.GameOperations, {
    segments: { gameKey: "keno" },
    params: { drawId: "2026-08-17.095" },
  });
  if (!built.ok) {
    throw new Error(`buildNavHref thất bại — registry đã đổi: ${built.reason}`);
  }

  return {
    input: {},
    state: "output-available",
    toolCallId: "call-1",
    toolName: "navigateTo",
    type: "dynamic-tool",
    output: { ok: true, autoNavigate, href: built.href, label: built.appliedLabel },
  } as EveDynamicToolPart;
}

const AMBER_WARNING = /Trang hiện tại có thay đổi chưa lưu/;

describe("useAiFormDirty — đầu GHI của hợp đồng dirty", () => {
  it("publish khoá `formDirty: true` khi form dirty", () => {
    renderHook(() => useAiFormDirty("rates", true));

    // Khoá phải đúng TÊN `formDirty`: `isAnySourceFormDirty()` dò đúng chuỗi này, gõ khác là mất
    // cảnh báo trong im lặng (không compiler nào bắt vì context là `Record<string, ...>`).
    expect(collectAiPageContext()).toEqual({ "form.rates": { formDirty: true } });
  });

  it("KHÔNG để lại group nào khi form sạch (giữ prompt gọn mỗi lượt)", () => {
    renderHook(() => useAiFormDirty("rates", false));

    // Truyền `false` thay vì `undefined` sẽ lọt qua `pruneEmpty` và gánh 6 group rác/lượt chat.
    expect(collectAiPageContext()).toBeUndefined();
  });

  it("hai form cùng trang KHÔNG đè nhau — form sạch không xoá cảnh báo của form đang sửa dở", () => {
    // Đây là cạm bẫy thật của trang config: 6 section (và trang tenant: 1 card/đại lý) mount ĐỒNG
    // THỜI. Dùng chung một key thì form mount sau (sạch) ghi đè form staff đang sửa dở.
    renderHook(() => {
      useAiFormDirty("prizes", true);
      useAiFormDirty("rates", false);
    });

    expect(collectAiPageContext()).toEqual({ "form.prizes": { formDirty: true } });
  });
});

describe("navigate-tool-card — nhãn thẻ + auto-navigate", () => {
  beforeEach(() => {
    currentPathname = "/dashboard";
    routerPush.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("panel + đích read-only + nguồn sạch: tự mở và ghi nhãn 'Đã mở'", () => {
    render(renderNavigateTo(navigateToPart(true)));

    expect(routerPush).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Đã mở")).toBeInTheDocument();
    expect(screen.queryByText(AMBER_WARNING)).not.toBeInTheDocument();
  });

  it("đích KHÔNG read-only: chỉ hiện nút 'Mở trang', không tự điều hướng", () => {
    render(renderNavigateTo(navigateToPart(false)));

    expect(routerPush).not.toHaveBeenCalled();
    expect(screen.getByText("Mở trang")).toBeInTheDocument();
    // Không phải dirty ⇒ KHÔNG được mượn dòng amber để giải thích: nó nói sai lý do.
    expect(screen.queryByText(AMBER_WARNING)).not.toBeInTheDocument();
  });

  it("nguồn có form dirty: hạ cấp thành nút + hiện cảnh báo amber (nhánh p1-04 §2.3)", () => {
    const unregister = registerAiPageContext("form.prizes", () => ({ formDirty: true }));

    try {
      render(renderNavigateTo(navigateToPart(true)));

      // Trọng tâm: đích read-only NHƯNG staff đang sửa dở ⇒ tuyệt đối không kéo họ khỏi input.
      expect(routerPush).not.toHaveBeenCalled();
      expect(screen.getByText("Mở trang")).toBeInTheDocument();
      expect(screen.getByText(AMBER_WARNING)).toBeInTheDocument();
    } finally {
      unregister();
    }
  });

  it("dirty tính theo trạng thái LÚC MOUNT — staff lưu xong giữa lượt không tự kéo trang đi", () => {
    let dirty = true;
    const unregister = registerAiPageContext("form.prizes", () => ({ formDirty: dirty }));

    try {
      const view = render(renderNavigateTo(navigateToPart(true)));

      dirty = false;
      act(() => {
        view.rerender(renderNavigateTo(navigateToPart(true)));
      });

      // Thẻ đã ghi "Mở trang"; nếu re-render đọc lại dirty thì nó sẽ đổi ý và navigate — staff mất
      // trang đang xem vì một lần lưu form ở chỗ khác.
      expect(routerPush).not.toHaveBeenCalled();
      expect(screen.getByText("Mở trang")).toBeInTheDocument();
    } finally {
      unregister();
    }
  });

  it("trang /ai: LUÔN chỉ hiện nút, bất kể đích read-only", () => {
    currentPathname = AI_FULL_PAGE_PATH;

    render(renderNavigateTo(navigateToPart(true)));

    // Rời trang chat đang gõ dở là phá flow ⇒ không auto-navigate. Và không có form dirty nào nên
    // KHÔNG được hiện dòng amber — nếu hiện, staff tưởng mình đang sửa dở ở đâu đó.
    expect(routerPush).not.toHaveBeenCalled();
    expect(screen.getByText("Mở trang")).toBeInTheDocument();
    expect(screen.queryByText(AMBER_WARNING)).not.toBeInTheDocument();
  });

  it("href lạ (không khớp registry): chặn điều hướng, hiện lỗi thay vì thẻ", () => {
    const part = navigateToPart(true);
    const output = part.output as { href: string };
    output.href = "/admin/superuser";

    render(renderNavigateTo(part));

    expect(routerPush).not.toHaveBeenCalled();
    expect(screen.getByText(/đường dẫn không hợp lệ/)).toBeInTheDocument();
  });
});
