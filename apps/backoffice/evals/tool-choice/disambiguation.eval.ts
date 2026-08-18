/**
 * Tool-choice: bộ case PHÂN BIỆT CẶP DỄ NHẦM — p1-03 §7 mục 2, quan trọng nhất trong bộ evals vì
 * đây chính là nguồn tool-choice error thật (2 tool cùng "trả lời được" 1 câu hỏi mơ hồ).
 *
 * 3 cặp nêu trong plan:
 * 1. `getOpsSnapshot` (kỳ ĐANG MỞ, số biến động) vs `getDrawSettleReport` (kỳ ĐÃ SETTLE, số cuối).
 * 2. `getGameConfig` (hoa hồng MẶC ĐỊNH hệ thống) vs `getTenantGameConfig` (hoa hồng override 1 đại lý).
 * 3. `getGameJackpot` (số ĐANG TÍCH LUỸ) vs `getJackpotHistory` (SỰ KIỆN vòng đã đóng).
 */

import { defineEval } from "eve/evals";

export default [
  // ─── Cặp 1: ops-snapshot (đang mở) vs settle-report (đã settle) ──────────────────────────
  defineEval({
    description: "Cặp 1a — kỳ ĐANG MỞ, hỏi 'lãi bao nhiêu' → phải dùng ops-snapshot (không có lãi net final).",
    async test(t) {
      const turn = await t.send(
        "Kỳ Keno 2026-08-17.020 đang mở, chưa đóng bán, hiện đang thu được bao nhiêu tiền rồi?",
      );
      turn.succeeded();
      turn.requireToolCall("getOpsSnapshot", { input: { game: "keno", drawId: "2026-08-17.020" } });
      turn.notCalledTool("getDrawSettleReport");
    },
  }),
  defineEval({
    description:
      "Cặp 1b — kỳ ĐÃ SETTLE, hỏi 'lãi bao nhiêu' → phải dùng settle-report (số final, không dùng snapshot realtime).",
    async test(t) {
      const turn = await t.send("Kỳ Keno 2026-08-16.020 đã settle xong hôm qua rồi, lãi net bao nhiêu?");
      turn.succeeded();
      turn.requireToolCall("getDrawSettleReport", { input: { game: "keno", drawId: "2026-08-16.020" } });
      turn.notCalledTool("getOpsSnapshot");
    },
  }),

  // ─── Cặp 2: getGameConfig (mặc định hệ thống) vs getTenantGameConfig (override đại lý) ─────
  defineEval({
    description: "Cặp 2a — hỏi hoa hồng MẶC ĐỊNH (không nhắc đại lý) → getGameConfig.",
    async test(t) {
      const turn = await t.send("Hoa hồng mặc định của hệ thống cho Keno hiện là bao nhiêu %?");
      turn.succeeded();
      turn.requireToolCall("getGameConfig", { input: { game: "keno" } });
      turn.notCalledTool("getTenantGameConfig");
    },
  }),
  defineEval({
    description: "Cặp 2b — hỏi hoa hồng của 1 ĐẠI LÝ cụ thể → getTenantGameConfig.",
    async test(t) {
      const turn = await t.send("Hoa hồng Keno của đại lý DL001 hiện là bao nhiêu %?");
      turn.succeeded();
      turn.requireToolCall("getTenantGameConfig", { input: { game: "keno", tenantId: "DL001" } });
      // Soft (không gate): model có thể hợp lý gọi thêm `getGameConfig` để đối chiếu baseline vs
      // override — xác nhận bằng chạy thật (2026-08-17), model gọi cả 2 tool cho câu hỏi này. Đây
      // là extra call chấp nhận được (không phải chọn SAI tool), khác với việc chỉ gọi
      // `getGameConfig` mà bỏ qua `getTenantGameConfig` (trường hợp đó vẫn bị bắt bởi
      // `requireToolCall` phía trên).
      turn.notCalledTool("getGameConfig").soft();
    },
  }),

  // ─── Cặp 3: getGameJackpot (đang tích luỹ) vs getJackpotHistory (vòng đã đóng) ─────────────
  defineEval({
    description: "Cặp 3a — hỏi số jackpot HIỆN TẠI (đang tích luỹ) → getGameJackpot.",
    async test(t) {
      const turn = await t.send("Jackpot Mega 6/45 hiện đang tích luỹ được bao nhiêu tiền rồi?");
      turn.succeeded();
      turn.requireToolCall("getGameJackpot", { input: { game: "mega645" } });
      turn.notCalledTool("getJackpotHistory");
    },
  }),
  defineEval({
    description: "Cặp 3b — hỏi vòng jackpot ĐÃ CHIA (sự kiện quá khứ) → getJackpotHistory.",
    async test(t) {
      const turn = await t.send("Vòng jackpot Mega 6/45 gần nhất đã chia cho ai, bao nhiêu tiền?");
      turn.succeeded();
      turn.requireToolCall("getJackpotHistory", { input: { game: "mega645" } });
      turn.notCalledTool("getGameJackpot");
    },
  }),
];
