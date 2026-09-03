/**
 * Tool-choice: `getVietlottResult` — kết quả kỳ quay ĐỐI CHIẾU với Vietlott, phân biệt với
 * `getDrawDetail` (chỉ xem nội bộ, không đối chiếu) — `10-ai-tool-vietlott-lookup.plan.md` §6.
 */

import { defineEval } from "eve/evals";

export default [
  defineEval({
    description: "Hỏi kết quả kỳ cụ thể, có ý so Vietlott → getVietlottResult, không phải getDrawDetail.",
    async test(t) {
      const turn = await t.send("Kết quả kỳ Keno 2026-08-17.001 so với Vietlott có khớp không?");
      turn.succeeded();
      turn.requireToolCall("getVietlottResult", { input: { game: "keno", drawId: "2026-08-17.001" } });
      turn.notCalledTool("getDrawDetail");
    },
  }),
  defineEval({
    description:
      "Đang xem trang vận hành Keno (route + page.operations.drawId) hỏi 'kết quả kỳ này' → suy " +
      "đúng game từ route, đúng drawId từ page.operations, không hỏi lại.",
    async test(t) {
      const turn = await t.send("Kết quả kỳ này là gì?", {
        clientContext: {
          route: "/games/keno/operations",
          page: { operations: { drawId: "2026-08-17.030" } },
        },
      });
      turn.succeeded();
      turn.requireToolCall("getVietlottResult", { input: { game: "keno", drawId: "2026-08-17.030" } });
    },
  }),
  defineEval({
    description: "Không nêu drawId, không ở trang vận hành → lấy kỳ hiện hành (drawId undefined).",
    async test(t) {
      const turn = await t.send("Kỳ Bingo 18 hiện tại kết quả ra sao?");
      turn.succeeded();
      turn.requireToolCall("getVietlottResult", {
        input: { game: "bingo18", drawId: (value) => value === undefined },
      });
    },
  }),
  defineEval({
    description:
      "Chỉ cần xem chi tiết kỳ (không nhắc Vietlott/đối chiếu) → getDrawDetail vẫn hợp lệ, không GATE getVietlottResult.",
    async test(t) {
      const turn = await t.send("Xem chi tiết kỳ Mega 6/45 2026-08-17.001 — đã đóng bán chưa, doanh thu bao nhiêu?");
      turn.succeeded();
      turn.requireToolCall("getDrawDetail", { input: { game: "mega645", drawId: "2026-08-17.001" } });
    },
  }),
];
