/**
 * AI Chat — barrel cho code render chart TRONG AI Chat (tabs, toggle, skeleton, icon).
 *
 * Engine suy luận thuần (`ChartModel`, `ChartKind`, formatter K/M/B...) đã dời sang
 * `@/lib/chart` (23/08, xem JSDoc file đó) để dùng lại được ở trang backoffice khác — barrel này
 * RE-EXPORT lại để code cũ trong `ai-chat/` (registry.tsx, report-views.ts...) không phải sửa
 * import path, và giữ đúng ranh giới "một thư mục riêng cho chart UI của AI Chat" (yêu cầu user,
 * §5 kế hoạch p1-05).
 *
 * KHÔNG export `chart-body.tsx` ở đây — file đó PHẢI luôn qua `next/dynamic` (xem
 * `chart-tool-view.tsx`), export thẳng ở barrel sẽ khiến bất kỳ import nào từ `chart/` kéo theo
 * cả chunk recharts vào bundle chính.
 */

export * from "@/lib/chart";

export { ChartIcon } from "./chart-icon";
export { ChartSkeleton } from "./chart-skeleton";
export type { ChartToolViewProps } from "./chart-tool-view";
export { ChartToolView } from "./chart-tool-view";
