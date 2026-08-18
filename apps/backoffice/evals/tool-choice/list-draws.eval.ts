/**
 * Tool-choice: `listDraws` — danh sách kỳ quay 1 game có filter, KHÁC `getDrawDetail` (1 kỳ cụ
 * thể) và `getDrawsOverview` (cross-game, không filter được theo game) — p1-03 §7.1.
 */

import { defineEval } from "eve/evals";

export default [
  defineEval({
    description: "Câu hỏi đời thường — tuần này Keno mở được bao nhiêu kỳ.",
    async test(t) {
      const turn = await t.send("Tuần này Keno mở được bao nhiêu kỳ rồi?");
      turn.succeeded();
      turn.requireToolCall("listDraws", { input: { game: "keno" } });
    },
  }),
  defineEval({
    description: "Câu hỏi chuyên môn — liệt kê kỳ đã công bố nhưng chưa settle.",
    async test(t) {
      const turn = await t.send("Liệt kê các kỳ Lotto 5/35 đã có kết quả nhưng chưa settle xong.");
      turn.succeeded();
      turn.requireToolCall("listDraws", { input: { game: "lotto535" } });
      // `status` đúng nhất là "published" (đã công bố, chưa settle) — soft vì model có thể diễn
      // giải bằng cách khác (ví dụ không filter status, chỉ liệt kê rồi tự lọc trong câu trả lời).
      turn.calledTool("listDraws", { input: { game: "lotto535", status: "published" } }).soft();
    },
  }),
];
