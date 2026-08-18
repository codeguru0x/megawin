/**
 * Tool-choice: `getVoidReport` — kỳ ĐÃ HUỶ (void), KHÁC `getDrawSettleReport` (kỳ settle bình
 * thường) — p1-03 §7.1. Void hiếm xảy ra nên câu hỏi luôn phải chỉ rõ "huỷ"/"void".
 */

import { defineEval } from "eve/evals";

export default [
  defineEval({
    description: "Câu hỏi chuyên môn — kỳ nào bị huỷ tuần này.",
    async test(t) {
      const turn = await t.send("Tuần này (2026-08-11 đến 2026-08-17) Keno có kỳ nào bị huỷ không?");
      turn.succeeded();
      turn.requireToolCall("getVoidReport", { input: { game: "keno", from: "2026-08-11", to: "2026-08-17" } });
    },
  }),
  defineEval({
    description: "Câu hỏi chuyên môn — breakdown hoàn tiền theo đại lý của 1 kỳ void cụ thể.",
    async test(t) {
      const turn = await t.send("Kỳ Lotto 5/35 mã 2026-08-15.095 bị huỷ, hoàn lại bao nhiêu tiền cho đại lý nào?");
      turn.succeeded();
      turn.requireToolCall("getVoidReport", { input: { game: "lotto535", drawId: "2026-08-15.095" } });
    },
  }),
];
