/**
 * Trang `/ai` — chat full-page kiểu ChatGPT/Claude, NẰM TRONG shell `(main)` (p1-01 §2.1): vẫn có
 * `AppSidebar` + header chung, KHÔNG full-bleed. Panel và trang này đọc CÙNG
 * `AiPanelProvider`/agent instance (§2.1.1) — nội dung hội thoại y hệt panel, chỉ khác surface.
 *
 * Server component, đọc 2 cookie rồi truyền xuống làm state khởi tạo (KHÔNG `useEffect` đọc ở client
 * — lần render đầu phải đúng ngay để cột phải không nháy hiện/ẩn sau hydrate):
 * - `ai_threads_panel`: panel lịch sử (cột phải) mở hay đóng.
 * - `sidebar_variant`: chỉ để biết `SidebarInset` có `m-2` (variant `inset`) hay không — cần cho
 *   phép tính chiều cao khung chat theo viewport trong `AiWorkspace`.
 */

import { AI_THREADS_PANEL_COOKIE, AI_THREADS_PANEL_VALUES } from "@/lib/preferences/ai-panel";
import { SIDEBAR_VARIANT_VALUES } from "@/lib/preferences/layout";
import { getPreference } from "@/server/server-actions";

import { AiWorkspace } from "./_lib/ai-workspace";

export default async function AiPage() {
  const [threadsPanel, variant] = await Promise.all([
    getPreference(AI_THREADS_PANEL_COOKIE, AI_THREADS_PANEL_VALUES, "open"),
    getPreference("sidebar_variant", SIDEBAR_VARIANT_VALUES, "inset"),
  ]);
  // Variant `inset`: `SidebarInset` có `md:m-2` ⇒ mất 8px trên + 8px dưới = `1rem` chiều cao.
  // Các variant khác không có margin dọc.
  return <AiWorkspace defaultThreadsOpen={threadsPanel === "open"} insetGap={variant === "inset" ? "1rem" : "0px"} />;
}
