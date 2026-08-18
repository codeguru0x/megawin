/**
 * Tool-choice: `getIntegrationHealth` — 1 call gộp 3 nguồn hạ tầng (dispatch KPI, order kẹt,
 * worker health), KHÔNG nhận filter theo game/kỳ — p1-03 §7.1.
 */

import { defineEval } from "eve/evals";

export default [
  defineEval({
    description: "Câu hỏi chuyên môn — sức khoẻ hạ tầng dispatch/worker tổng quan.",
    async test(t) {
      const turn = await t.send(
        "Hệ thống dispatch trả thưởng sang đại lý có ổn không, worker settle có bị crash không?",
      );
      turn.succeeded();
      turn.requireToolCall("getIntegrationHealth");
    },
  }),
  defineEval({
    description: "Câu hỏi đời thường — có lệnh trả thưởng nào bị kẹt không.",
    async test(t) {
      const turn = await t.send("Có lệnh trả thưởng nào đang bị kẹt, retry nhiều lần không?");
      turn.succeeded();
      turn.requireToolCall("getIntegrationHealth");
    },
  }),
];
