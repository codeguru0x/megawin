/**
 * Tool eve: `getIntegrationHealth` — 1 call gộp 3 nguồn hạ tầng: KPI dispatch sang tenant, order
 * đang kẹt retry, sức khoẻ các worker settle/sync.
 *
 * KHÔNG chạm repo/DB trực tiếp — chỉ gọi qua use-case (`app-use-case-layering.mdc` §3),
 * `GetIntegrationHealthUseCase` (`server/ai/integration/`) là aggregate 3 nguồn, mỗi nguồn lỗi
 * chỉ đánh dấu `unavailable: true` (partial degradation), không giết cả tool.
 *
 * `safeRun()` KHÔNG BAO GIỜ throw (trừ khi CẢ 3 nguồn đều lỗi). `toToolResult` bắt buộc —
 * dispatch order/worker health có nhiều field `Date`/ISO string lẫn nhau; nó cũng log + làm sạch
 * payload khi lỗi (xem `server/ai/tool-result.ts`).
 */

import { defineTool } from "eve/tools";
import { z } from "zod";

import { toToolResult } from "@/server/ai";
import { GetIntegrationHealthUseCase } from "@/server/ai/integration/get-integration-health";

const useCase = new GetIntegrationHealthUseCase();

export default defineTool({
  description:
    "Tổng quan sức khoẻ hạ tầng tích hợp trong 1 call: KPI lệnh dispatch sang tenant (theo " +
    "status), top 10 order đang kẹt retry cao, và trạng thái từng worker (idle/running/" +
    "crashed/disabled). Dùng cho câu hỏi kiểu 'hệ thống có ổn không', 'có lệnh trả thưởng nào " +
    "kẹt không', 'worker settle Keno có đang bật không'. Nguồn nào lỗi sẽ có " +
    "`unavailable: true` — PHẢI nói rõ nguồn đó tạm không đọc được, KHÔNG suy đoán số. Muốn " +
    "CHI TIẾT từng order dispatch (không chỉ 10 order kẹt) → chưa có tool, chỉ đường vào " +
    "trang vận hành dispatch.",
  inputSchema: z.object({
    from: z.string().optional().describe("Ngày bắt đầu range cho KPI dispatch, format YYYY-MM-DD."),
    to: z.string().optional().describe("Ngày kết thúc range cho KPI dispatch, format YYYY-MM-DD."),
    tenantId: z.string().optional().describe("Lọc theo 1 đại lý cụ thể. Bỏ trống = toàn hệ thống."),
  }),
  execute: async (input) => toToolResult(await useCase.safeRun(input), "getIntegrationHealth"),
});
