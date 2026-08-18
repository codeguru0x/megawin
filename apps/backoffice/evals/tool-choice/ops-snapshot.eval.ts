/**
 * Tool-choice: `getOpsSnapshot` — snapshot REALTIME của 1 kỳ ĐANG MỞ (`game`+`drawId` bắt buộc).
 * Cặp dễ nhầm với `getDrawSettleReport` (kỳ ĐÃ settle) được kiểm riêng ở `disambiguation.eval.ts`.
 */

import { defineEval } from "eve/evals";

export default [
  defineEval({
    description: "Câu hỏi chuyên môn — snapshot doanh thu/exposure của 1 kỳ đang mở.",
    async test(t) {
      const turn = await t.send(
        "Kỳ 2026-08-17.010 của Keno đang mở, cho tôi snapshot vận hành: doanh thu, exposure, đếm alert.",
      );
      turn.succeeded();
      turn.requireToolCall("getOpsSnapshot", { input: { game: "keno", drawId: "2026-08-17.010" } });
    },
  }),
  defineEval({
    description: "Câu hỏi đời thường — ai đang cược nhiều nhất kỳ đang bán.",
    async test(t) {
      const turn = await t.send("Kỳ Power 6/55 mã 2026-08-17.003 đang bán, ai đang cược nhiều nhất vậy?");
      turn.succeeded();
      turn.requireToolCall("getOpsSnapshot", { input: { game: "power655", drawId: "2026-08-17.003" } });
    },
  }),
];
