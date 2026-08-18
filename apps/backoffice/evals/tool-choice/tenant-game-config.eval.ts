/**
 * Tool-choice: `getTenantGameConfig` — cấu hình RIÊNG 1 đại lý (hoa hồng override, cấm chơi).
 * Cặp dễ nhầm với `getGameConfig` (hoa hồng MẶC ĐỊNH hệ thống) kiểm ở `disambiguation.eval.ts`.
 */

import { defineEval } from "eve/evals";

export default [
  defineEval({
    description: "Câu hỏi chuyên môn — hoa hồng override của 1 đại lý cụ thể.",
    async test(t) {
      const turn = await t.send("Đại lý DL001 hoa hồng Keno bao nhiêu, có bị override không?");
      turn.succeeded();
      turn.requireToolCall("getTenantGameConfig", { input: { game: "keno", tenantId: "DL001" } });
    },
  }),
  defineEval({
    description: "Câu hỏi đời thường — đại lý có bị khoá chơi 1 game không.",
    async test(t) {
      const turn = await t.send("Đại lý DL002 có đang bị khoá không cho chơi Power 6/55 không?");
      turn.succeeded();
      turn.requireToolCall("getTenantGameConfig", { input: { game: "power655", tenantId: "DL002" } });
    },
  }),
];
