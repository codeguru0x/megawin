/**
 * Tool-choice: `getOpsAlerts` — chi tiết alert vận hành của 1 kỳ, KHÁC `getOpsSnapshot` (chỉ
 * đếm alert qua `alertCounts`, không chi tiết từng alert) — p1-03 §7.1/§7.2.
 */

import { defineEval } from "eve/evals";

export default [
  defineEval({
    description: "Câu hỏi chuyên môn — danh sách alert exposure của 1 kỳ.",
    async test(t) {
      const turn = await t.send("Kỳ 2026-08-17.005 của Mega 6/45 có alert exposure nào chưa xử lý không?");
      turn.succeeded();
      turn.requireToolCall("getOpsAlerts", { input: { game: "mega645", drawId: "2026-08-17.005" } });
    },
  }),
  defineEval({
    description: "Câu hỏi đời thường — chỉ cần biết SỐ LƯỢNG alert (không cần chi tiết) → không nên gọi getOpsAlerts.",
    async test(t) {
      const turn = await t.send("Kỳ 2026-08-17.005 của Mega 6/45 hiện có mấy alert mới, chưa cần xem chi tiết.");
      turn.succeeded();
      // `alertCounts` đã có trong `getOpsSnapshot` — gọi thêm `getOpsAlerts` là tốn tool-call
      // không cần thiết cho câu hỏi CHỈ CẦN SỐ ĐẾM (mô tả tool đã nói rõ điều này).
      turn.calledTool("getOpsSnapshot", { input: { game: "mega645", drawId: "2026-08-17.005" } });
      turn.notCalledTool("getOpsAlerts").soft();
    },
  }),
];
