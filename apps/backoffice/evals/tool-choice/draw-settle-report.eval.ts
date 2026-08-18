/**
 * Tool-choice: `getDrawSettleReport` — báo cáo tài chính kỳ ĐÃ SETTLE, có 2 drill-down (list theo
 * range / breakdown theo tenant khi có `drawId`). Cặp dễ nhầm với `getOpsSnapshot` ở
 * `disambiguation.eval.ts`.
 */

import { defineEval } from "eve/evals";

export default [
  defineEval({
    description: "Câu hỏi chuyên môn — lợi nhuận ròng kỳ đã settle hôm qua.",
    async test(t) {
      const turn = await t.send("Kỳ Power 6/55 hôm qua (2026-04-14) đã settle rồi, lãi net bao nhiêu?");
      turn.succeeded();
      turn.requireToolCall("getDrawSettleReport", {
        input: { game: "power655", from: "2026-04-14", to: "2026-04-14" },
      });
    },
  }),
  defineEval({
    description: "Câu hỏi đời thường — đại lý nào đóng góp doanh thu nhiều nhất kỳ đã settle cụ thể.",
    async test(t) {
      const turn = await t.send(
        "Kỳ Lotto 5/35 mã 2026-04-06.002 đã settle xong, đại lý nào đóng doanh thu nhiều nhất?",
      );
      turn.succeeded();
      turn.requireToolCall("getDrawSettleReport", {
        input: { game: "lotto535", drawId: "2026-04-06.002" },
      });
    },
  }),
];
