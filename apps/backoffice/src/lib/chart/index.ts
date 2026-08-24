/**
 * Chart engine dùng chung cho TOÀN backoffice — pure (không import React/recharts), suy luận
 * `ChartModel` từ dữ liệu dạng bảng bất kỳ.
 *
 * Ban đầu viết riêng cho AI Chat (`components/ai-chat/chart/`, xem
 * `.cursor/plans/ai-panel/p1-05-chart-generative-ui.plan.md`), sau đó dời ra đây (23/08) để trang
 * backoffice thường (không qua AI) cũng dùng lại được — vd 1 dashboard mới muốn "cho tôi bảng, tôi
 * tự suy luận trục X/series/loại chart phù hợp" mà không viết lại từ đầu.
 *
 * Phần RENDER recharts thật (`chart-body.tsx`, `chart-tool-view.tsx`, `chart-skeleton.tsx`,
 * `chart-icon.tsx`) vẫn nằm ở `components/ai-chat/chart/` vì gắn với UX đặc thù của AI Chat (toggle
 * đổi loại, số liệu gập trong `<details>`) — file đó IMPORT từ đây, không định nghĩa
 * lại. Trang backoffice khác muốn vẽ chart thật thì tự viết component recharts riêng, dùng
 * `buildChartModel`/formatter ở đây làm nền — KHÔNG import `components/ai-chat/chart/chart-body.tsx`
 * (file đó luôn phải qua `next/dynamic`, xem comment đầu file đó).
 */

export * from "./chart-catalog";
export * from "./chart-format";
export * from "./chart-inference";
