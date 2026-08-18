/**
 * Tool-choice: `getFinancialByGame` (so sánh nhiều game) vs `getSystemOutstanding` (entries đang
 * chờ settle, live). Cả 2 đều "tài chính" nhưng KHÁC hẳn use-case — dễ nhầm khi staff hỏi mơ hồ
 * "tình hình tài chính hệ thống hiện tại thế nào" mà không phân biệt "đã có số" vs "đang chờ".
 */

import { defineEval } from "eve/evals";

export default [
  defineEval({
    description: "Câu hỏi chuyên môn — so sánh doanh thu các game trong 1 tuần.",
    async test(t) {
      const turn = await t.send("So sánh doanh thu các game từ 2026-08-10 đến 2026-08-17.");
      turn.succeeded();
      turn.requireToolCall("getFinancialByGame", { input: { from: "2026-08-10", to: "2026-08-17" } });
    },
  }),
  defineEval({
    description: "Câu hỏi đời thường — hiện có bao nhiêu tiền đang chờ settle, chưa cần theo game nào.",
    async test(t) {
      const turn = await t.send(
        "Hiện tại toàn hệ thống có bao nhiêu kỳ đang chờ settle, tổng tiền cược treo bao nhiêu?",
      );
      turn.succeeded();
      turn.requireToolCall("getSystemOutstanding");
      turn.notCalledTool("getFinancialByGame").soft();
    },
  }),
];
