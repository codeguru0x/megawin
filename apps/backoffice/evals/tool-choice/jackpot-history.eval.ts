/**
 * Tool-choice: `getJackpotHistory` (SỰ KIỆN vòng đã đóng) vs `getGameJackpot` (số ĐANG TÍCH LUỸ) —
 * cặp dễ nhầm p1-03 §7.2 mục 2. Kiểm tra bổ sung ở `disambiguation.eval.ts`.
 */

import { defineEval } from "eve/evals";

export default [
  defineEval({
    description: "Câu hỏi chuyên môn — vòng jackpot trước ai trúng, bao nhiêu tiền.",
    async test(t) {
      const turn = await t.send("Vòng Jackpot Mega 6/45 trước ai trúng, chia bao nhiêu tiền?");
      turn.succeeded();
      turn.requireToolCall("getJackpotHistory", { input: { game: "mega645" } });
    },
  }),
  defineEval({
    description: "Câu hỏi đời thường — jackpot đã chia mấy lần rồi, xem diễn biến 1 vòng cụ thể.",
    async test(t) {
      const turn = await t.send("Vòng jackpot số 12 của Power 6/55 diễn biến từng kỳ thế nào?");
      turn.succeeded();
      turn.requireToolCall("getJackpotHistory", { input: { game: "power655", cycleNo: 12 } });
    },
  }),
];
