/**
 * Tool-choice: `searchAuditLogs` — nhật ký thao tác toàn hệ thống (ai làm gì, lúc nào).
 */

import { defineEval } from "eve/evals";

export default [
  defineEval({
    description: "Câu hỏi chuyên môn — ai huỷ 1 kỳ quay cụ thể.",
    async test(t) {
      const turn = await t.send("Ai đã huỷ kỳ #2026-08-15.095 của Lotto 5/35, lúc nào?");
      turn.succeeded();
      turn.requireToolCall("searchAuditLogs");
    },
  }),
  defineEval({
    description: "Câu hỏi đời thường — staff nào sửa cấu hình Keno hôm qua.",
    async test(t) {
      const turn = await t.send("Hôm qua có ai sửa cấu hình Keno không, ai làm vậy?");
      turn.succeeded();
      turn.requireToolCall("searchAuditLogs", { input: { game: "keno" } });
    },
  }),
];
