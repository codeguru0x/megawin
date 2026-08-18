/**
 * Agent vận hành nội bộ MegaWin — trợ lý AI cho staff trong AI Panel (backoffice).
 *
 * Model dùng string ID qua Vercel AI Gateway (KHÔNG cấu hình `LanguageModel` trực tiếp):
 * - Trên Vercel: authenticate qua OIDC, không cần API key riêng.
 * - Local dev: cần env `AI_GATEWAY_API_KEY` (xem `src/env.ts` + `.env.example`).
 *
 * Đổi model qua env `EVE_AGENT_MODEL` để test model khác mà không sửa code/redeploy.
 */

import { defineAgent } from "eve";

export default defineAgent({
  // `||` (không phải `??`): EVE_AGENT_MODEL có thể là chuỗi rỗng "" khi khai báo nhưng chưa
  // điền giá trị trong .env.local — `??` chỉ fallback với null/undefined, để lọt "" xuống
  // compiler gây lỗi "model does not have known AI Gateway context window metadata".
  model: process.env.EVE_AGENT_MODEL || "anthropic/claude-sonnet-5",
  reasoning: "low",

  limits: {
    // ⚠️ Đây là trần cho CẢ SESSION (thread), KHÔNG phải cho một câu trả lời — chạm trần thì eve
    // park session và hiện continuation prompt Approve/Stop (`node_modules/eve/docs/agent-config.md`
    // §Runtime limits). Thread `/ai` là durable session sống nhiều ngày (p1-01), nên định mức theo
    // "một phiên làm việc dài", không theo "một câu hỏi". Chống trả lời dài dòng là việc của
    // instructions (`50-answer-shape.md`), không phải của limits.
    //
    // BẢN CHẤT hai số này: eve tự gọi chúng là "a guardrail against defective long-running sessions"
    // (nguyên văn prompt trong `dist/src/harness/session-limit-continuation.js`) — tức bộ BẮT LOOP
    // (agent lặp vô hạn), KHÔNG phải hạn mức chi phí. Kiểm chi phí bằng `costUsd` trong step event.
    // Đặt theo tư duy "giới hạn tiền" sẽ ra số quá chặt và cắt ngang staff đang làm việc bình thường.
    //
    // ĐO THẬT (53 case `evals/`, run 2026-08-18T06-53-40, sonnet-5 + reasoning low):
    //   input/lượt  : trung vị 64.770 · tb 77.152 · max 281.438 (case 8 model call)
    //   output/lượt : trung vị    278 · tb    373 · max   2.284
    // Suy ra: 20M input ≈ 300 lượt (trung vị) / 250 lượt (tb) / ~70 lượt ở case nặng nhất — đủ cho
    // một thread sống nhiều ngày, mà vẫn chặn được loop. 200k output ≈ 700 lượt, cùng bậc độ lớn nên
    // hai trục không lệch nhau (trần 2M cũ chỉ ~30 lượt input trong khi output tới ~700 → input
    // thành nút cổ chai duy nhất, staff gặp continuation prompt mỗi ~30 lượt).
    //
    // CẠM BẪY: prompt cache đọc lại chiếm 92,2% input, nhưng `inputTokens` provider báo ĐÃ GỘP
    // `cacheReadTokens`. Cache giảm TIỀN (~$0,018/lượt), KHÔNG giảm số đếm vào trần này một chút nào.
    //
    // Đổi số thì phải chạy eval trước/sau và ghi vào bảng ngân sách token ở
    // `.cursor/plans/ai-panel/p1-03-ops-data-visibility.plan.md` §3 (`eve-eval-workflow.mdc` §5).
    // Đặt quá chặt còn làm `evals/` đỏ vì hết quota (task-mode fail `SESSION_TOKEN_LIMIT_REACHED`
    // thay vì hỏi người thật) — đỏ vì quota, không phải vì model chọn sai tool.
    maxInputTokensPerSession: 20_000_000,
    maxOutputTokensPerSession: 200_000,
  },

  // System instructions nằm NGOÀI history nên compaction không cắt được phần đó, và eve còn cộng
  // envelope checkpoint vào ngưỡng kích hoạt. Hạ xuống 0.8 (default 0.9) để nén sớm hơn, tránh
  // turn điều tra nhiều bước bị cắt giữa chừng.
  compaction: { thresholdPercent: 0.8 },
});
