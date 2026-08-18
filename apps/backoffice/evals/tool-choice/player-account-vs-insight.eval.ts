/**
 * Tool-choice: `getPlayerAccountInfo` (định danh, rẻ) vs `getPlayerInsight` (tài chính, đắt) —
 * cặp quan trọng nhất trong domain player vì lý do tách 2 tool này chính là chi phí (xem JSDoc
 * `agent/tools/getPlayerAccountInfo.ts`). Model KHÔNG được gọi `getPlayerInsight` khi câu hỏi chỉ
 * cần tra định danh, và PHẢI gọi `getPlayerAccountInfo` trước khi có `accountId` cho câu hỏi tài
 * chính theo username.
 *
 * Dùng `player4` — username THẬT có trong DB dev (xác nhận 2026-08-17). Case 2 trước đó dùng
 * `player4` (không tồn tại) → `getPlayerAccountInfo` trả not-found → model hợp lý dừng lại,
 * không có accountId để gọi `getPlayerInsight`, khiến eval fail dù model hành xử đúng. Đây là vấn
 * đề fixture, không phải tool-choice — đổi sang username thật để test đúng luồng 2 bước.
 */

import { defineEval } from "eve/evals";

export default [
  defineEval({
    description: "Câu hỏi đời thường — username này là ai, accountId nào (CHỈ định danh, không tài chính).",
    async test(t) {
      const turn = await t.send("Username player4 là ai, accountId của họ là gì?");
      turn.succeeded();
      turn.requireToolCall("getPlayerAccountInfo", { input: { keyword: "player4" } });
      // Câu hỏi này KHÔNG cần số liệu tài chính — gọi thêm `getPlayerInsight` là trả giá đắt
      // không cần thiết cho 1 câu hỏi định danh thuần (lý do tách tool, xem JSDoc).
      turn.notCalledTool("getPlayerInsight").soft();
    },
  }),
  defineEval({
    description: "Câu hỏi chuyên môn — tài chính player theo username (2 bước: tra accountId trước, rồi insight).",
    async test(t) {
      const turn = await t.send("Xem tổng quan tài chính từ 2026-08-01 đến 2026-08-17 của player username player4.");
      turn.succeeded();
      // Chưa biết `accountId` → PHẢI gọi `getPlayerAccountInfo` trước để tra định danh, không
      // được bịa `accountId` truyền thẳng vào `getPlayerInsight`.
      turn.requireToolCall("getPlayerAccountInfo", { input: { keyword: "player4" } });
      turn.calledTool("getPlayerInsight", { input: { from: "2026-08-01", to: "2026-08-17" } });
      turn.toolOrder(["getPlayerAccountInfo", "getPlayerInsight"]);
    },
  }),
];
