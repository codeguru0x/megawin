/**
 * Tool eve: `navigateTo` — mở một trang backoffice cụ thể kèm filter đúng (p1-04 §3).
 *
 * Đổi tên từ `navigateToReport` (p1-01 §4) — phạm vi không còn là "report": đích giờ gồm cả
 * operations, config, guides, player detail. Giữ tên cũ sẽ dạy model rằng chỉ mở được báo cáo.
 *
 * OUTPUT-DRIVEN: tool chạy server-side, KHÔNG đụng router client trực tiếp — chỉ validate + build
 * `href` từ registry đóng ({@link NAV_REGISTRY} qua {@link buildNavHref}), trả về cho renderer
 * client quyết định navigate (panel: auto-push nếu `autoNavigate`; trang `/ai`: chỉ hiện nút — xem
 * `navigate-tool-card.tsx`).
 *
 * `page` là enum từ const registry, KHÔNG path tự do — model không thể tự bịa path bất kỳ (chặn
 * lớp đầu của prompt injection dụ điều hướng ra ngoài whitelist; lớp thứ 2 ở client, xem
 * `isKnownNavHref`).
 *
 * KHÔNG throw khi validate fail — trả `ok: false` kèm `validParams`/`hint` (error-driven discovery,
 * §1.4 plan). Model đọc và tự sửa lời gọi, dặn trong `instructions.md`: tối đa 2 lần thử lại cho
 * cùng `page`.
 */

import { defineTool } from "eve/tools";
import { z } from "zod";

import { buildNavHref, NAV_REGISTRY, NavGroupKey, NavPage } from "@/lib/nav-registry";

/** Nhãn nhóm tiếng Việt cho description — gộp enum theo nhóm để model định vị nhanh (p1-03 §1.1 mục 6). */
const GROUP_LABELS: Record<NavGroupKey, string> = {
  [NavGroupKey.System]: "hệ thống",
  [NavGroupKey.Reports]: "báo cáo hệ thống",
  [NavGroupKey.Player]: "người chơi",
  [NavGroupKey.Game]: "theo 1 game cụ thể",
  [NavGroupKey.Docs]: "tài liệu",
};

/**
 * Build phần enum-theo-nhóm của description — tự sinh từ {@link NAV_REGISTRY}, KHÔNG hardcode danh
 * sách 20 tên. Thêm/xoá entry trong registry tự động phản ánh vào description, không phải sửa 2 chỗ.
 */
function buildGroupedPageList(): string {
  const byGroup = new Map<NavGroupKey, string[]>();
  for (const [page, def] of Object.entries(NAV_REGISTRY)) {
    const list = byGroup.get(def.group) ?? [];
    list.push(page);
    byGroup.set(def.group, list);
  }
  return Object.values(NavGroupKey)
    .map((group) => `${GROUP_LABELS[group]}: ${(byGroup.get(group) ?? []).join(", ")}`)
    .join(" · ");
}

export default defineTool({
  description:
    `Mở một trang cụ thể trong backoffice kèm filter đúng. Các trang theo nhóm — ${buildGroupedPageList()}. ` +
    "CHỈ gọi khi staff muốn XEM trang đó (hoặc cần thao tác tiếp trên trang — ack alert, sửa config, " +
    "publish kết quả); câu hỏi cần SỐ thì trả lời trực tiếp bằng tool dữ liệu, KHÔNG mở trang để 'staff " +
    "tự xem'. Trang cần `accountId` (player) — tra bằng `getPlayerAccountInfo` TRƯỚC, tool này không " +
    "tra hộ và không nhận username. Gọi lỗi → đọc `validParams`/`hint` trong output, sửa lại lời gọi " +
    "TỐI ĐA 2 lần cho cùng `page`, sau đó báo staff là chưa mở được.",
  inputSchema: z.object({
    page: z.enum(NavPage).describe("Trang cần mở — chỉ nhận giá trị trong enum."),
    segments: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        "Giá trị cho dynamic segment của trang (vd `accountId` cho player-settle, `gameKey` cho trang theo game, `docSlug` cho guides-resettle).",
      ),
    params: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        "Filter theo vocabulary canonical: drawId, tenantId, accountId, from, to, tab, level, page… " +
          "KHÔNG dùng tên viết tắt riêng của từng trang — sai tên sẽ bị tool báo lại kèm danh sách hợp lệ.",
      ),
  }),
  execute: async (input) => {
    const result = buildNavHref(input.page, { segments: input.segments, params: input.params });
    if (!result.ok) {
      return result;
    }
    const entry = NAV_REGISTRY[input.page];
    return {
      ok: true,
      href: result.href,
      label: result.appliedLabel,
      autoNavigate: entry.autoNavigate,
    };
  },
});
