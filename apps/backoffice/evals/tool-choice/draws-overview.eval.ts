/**
 * Tool-choice: `getDrawsOverview` — bức tranh kỳ quay cross-game, KHÔNG nhận tham số (p1-03 §7.1).
 *
 * 2 case: 1 câu chuyên môn (nhắc rõ "kỳ quay" đa game), 1 câu đời thường ("game nào đang mở").
 */

import { defineEval } from "eve/evals";

export default [
  defineEval({
    description: "Câu hỏi chuyên môn — tổng quan kỳ quay tất cả game.",
    async test(t) {
      await t.send("Cho tôi bức tranh tổng quan các kỳ quay đang diễn ra của tất cả game hiện tại.");
      t.succeeded();
      t.calledTool("getDrawsOverview", { count: 1 });
    },
  }),
  defineEval({
    description: "Câu hỏi đời thường — game nào đang mở, game nào vừa quay xong.",
    async test(t) {
      await t.send("Game nào đang mở kỳ, game nào vừa quay xong vậy?");
      t.succeeded();
      t.calledTool("getDrawsOverview", { count: 1 });
    },
  }),
];
