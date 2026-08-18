/**
 * Tool-choice: `getDispatchOrders` — nhật ký lệnh dispatch CHI TIẾT có filter, KHÁC
 * `getIntegrationHealth` (KPI tổng hợp + top 10 kẹt nhất, không filter được) — p1-03 §7.1.
 */

import { defineEval } from "eve/evals";

export default [
  defineEval({
    description: "Câu hỏi chuyên môn — tra 1 order dispatch theo mã giao dịch.",
    async test(t) {
      const turn = await t.send("Order dispatch mã tx 018f5c3e-1234-7abc-9def-0123456789ab trạng thái gì?");
      turn.succeeded();
      turn.requireToolCall("getDispatchOrders", { input: { tx: "018f5c3e-1234-7abc-9def-0123456789ab" } });
    },
  }),
  defineEval({
    description: "Câu hỏi đời thường — player này có lệnh trả thưởng nào chưa nhận không.",
    async test(t) {
      const turn = await t.send("Player username player4 có lệnh trả thưởng nào chưa dispatch xong không?");
      turn.succeeded();
      turn.requireToolCall("getDispatchOrders", { input: { username: "player4" } });
    },
  }),
];
