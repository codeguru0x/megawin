/**
 * Tool-efficiency: đo NGÂN SÁCH TRA CỨU, không đo tool-choice.
 *
 * eve 0.38.3 KHÔNG có runtime cap cho số tool call — `AgentLimitsDefinition` chỉ có
 * `maxInputTokensPerSession`/`maxOutputTokensPerSession`/`sessionTimeoutMs`
 * (`node_modules/eve/docs/agent-config.md` §Runtime limits), và hook là observe-only nên không chặn
 * được. Vì vậy nguyên tắc "1 lần tra cho cả khoảng, không tra lặp từng ngày" sống ở 2 chỗ: mô tả
 * tool + `40-tool-policy.md`, và chỗ ĐO nó là chính file này (`t.maxToolCalls`).
 *
 * Trần call để chỗ rộng cho 1 lần `bash`/`python3` (rule 2 của instructions BẮT BUỘC tính toán bằng
 * máy, không nhẩm) — điều bị bắt lỗi ở đây là N+1 (gọi báo cáo mỗi ngày một lần), không phải việc
 * gọi thêm công cụ tính.
 */

import { defineEval } from "eve/evals";

export default [
  defineEval({
    description:
      "Trung bình/ngày trên khoảng 30 ngày — phải gọi báo cáo theo ngày ĐÚNG MỘT LẦN cho cả khoảng, " +
      "không gọi 30 lần từng ngày.",
    async test(t) {
      const turn = await t.send(
        "Từ 2026-07-01 đến 2026-07-30, trung bình mỗi ngày hệ thống thu về bao nhiêu doanh thu?",
      );
      turn.succeeded();
      // `requireToolCall` không nhận `count` (nó trả về 1 call) — đúng thứ cần khẳng định ở đây là
      // "gọi ĐÚNG một lần cho cả khoảng", nên dùng `calledTool` với `count: 1`.
      turn.calledTool("getFinancialDailyOverview", {
        input: { from: "2026-07-01", to: "2026-07-30" },
        count: 1,
      });
      turn.maxToolCalls(4);
    },
  }),
  defineEval({
    description: "So sánh giữa các game trong 1 tuần — dùng tool chia theo game 1 lần, không lặp tool theo ngày.",
    async test(t) {
      const turn = await t.send("Tuần 2026-08-10 đến 2026-08-16, game nào doanh thu cao nhất?");
      turn.succeeded();
      turn.calledTool("getFinancialByGame", {
        input: { from: "2026-08-10", to: "2026-08-16" },
        count: 1,
      });
      turn.notCalledTool("getFinancialDailyOverview").soft();
      turn.maxToolCalls(4);
    },
  }),
  defineEval({
    description: "Câu hỏi một số duy nhất (mệnh giá) — không tra thêm thứ không được hỏi.",
    async test(t) {
      const turn = await t.send("Mệnh giá Keno hiện tại là bao nhiêu?");
      turn.succeeded();
      turn.requireToolCall("getGameConfig");
      turn.maxToolCalls(3);
    },
  }),
];
