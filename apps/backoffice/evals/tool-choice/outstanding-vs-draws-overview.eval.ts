/**
 * Tool-choice: `getDrawsOverview` (kỳ quay đang ở TRẠNG THÁI nào) vs `getSystemOutstanding` (TIỀN
 * đang treo theo game). Cả 2 đều cross-game, đều "hiện tại", đều không có tham số — khác nhau ở
 * thứ trả về: một cái là lịch/trạng thái kỳ, một cái là số tiền pending.
 *
 * Cặp này KHÔNG được phủ trước 18/08: `financial-vs-outstanding.eval.ts` chỉ so outstanding với
 * `getFinancialByGame`. Description cũ của `getSystemOutstanding` còn ghi sai là "danh sách tất cả
 * kỳ quay đang chờ settle" → đúng chỗ model bị dẫn sang tool sai cho câu hỏi trạng thái kỳ.
 */

import { defineEval } from "eve/evals";

export default [
  defineEval({
    description: "Hỏi TRẠNG THÁI kỳ quay cross-game — phải dùng getDrawsOverview, không phải tool tiền treo.",
    async test(t) {
      const turn = await t.send("Các game đang ở kỳ nào, kỳ nào sắp đóng cổng?");
      turn.succeeded();
      turn.requireToolCall("getDrawsOverview");
      turn.notCalledTool("getSystemOutstanding");
    },
  }),
  defineEval({
    description: "Hỏi TIỀN đang treo — phải dùng getSystemOutstanding, không phải tool trạng thái kỳ.",
    async test(t) {
      const turn = await t.send("Toàn hệ thống đang treo bao nhiêu tiền cược chưa settle?");
      turn.succeeded();
      turn.requireToolCall("getSystemOutstanding");
      turn.notCalledTool("getDrawsOverview").soft();
    },
  }),
  defineEval({
    description:
      "Tiền treo là snapshot hiện tại, không tra được quá khứ — không được lấy số đã chốt thay thế mà " +
      "im lặng, phải nói rõ giới hạn.",
    async test(t) {
      const turn = await t.send("Hôm 2026-08-10 lúc 15h hệ thống đang treo bao nhiêu tiền?");
      turn.succeeded();
      turn.notCalledTool("getSystemOutstanding").soft();
    },
  }),
];
