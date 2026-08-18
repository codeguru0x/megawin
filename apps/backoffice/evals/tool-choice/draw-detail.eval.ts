/**
 * Tool-choice: `getDrawDetail` — chi tiết 1 kỳ CỤ THỂ hoặc kỳ ĐANG MỞ khi bỏ trống `drawId`
 * (p1-03 §7.1). Case 2 xác nhận model KHÔNG bắt buộc phải có `drawId` khi hỏi "kỳ hiện tại".
 */

import { defineEval } from "eve/evals";

export default [
  defineEval({
    description: "Câu hỏi chuyên môn — chi tiết 1 kỳ quay cụ thể theo drawId.",
    async test(t) {
      await t.send("Xem chi tiết kỳ quay 2026-08-17.001 của Keno.");
      t.succeeded();
      t.calledTool("getDrawDetail", {
        input: { game: "keno", drawId: "2026-08-17.001" },
        count: 1,
      });
    },
  }),
  defineEval({
    description: "Câu hỏi đời thường — kỳ Lotto đang chạy là kỳ nào (không có drawId).",
    async test(t) {
      const turn = await t.send("Lotto 5/35 đang quay kỳ nào vậy, cho tôi biết thông tin kỳ đó.");
      turn.succeeded();
      // `drawId` PHẢI vắng mặt (hoặc undefined) — có drawId nghĩa là model bịa mã kỳ không có
      // trong hội thoại, đây chính là lỗi tool-choice/tham số cần bắt (§7 mục 1).
      turn.requireToolCall("getDrawDetail", {
        input: { game: "lotto535", drawId: (value) => value === undefined },
      });
    },
  }),
];
