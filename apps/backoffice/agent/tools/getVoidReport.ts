/**
 * Tool eve: `getVoidReport` — báo cáo kỳ ĐÃ HUỶ (void) của 1 game: danh sách kỳ đã void trong
 * khoảng ngày, hoặc breakdown theo tenant của 1 kỳ void cụ thể.
 *
 * KHÔNG chạm repo/DB trực tiếp — chỉ gọi qua use-case (`app-use-case-layering.mdc` §3), dispatcher
 * `GetVoidReportDispatchUseCase` (`server/ai/reports/`) chọn đúng
 * `ListVoidReportsUseCase`/`ListVoidDrawTenantsUseCase` của package tương ứng.
 *
 * Void kỳ quay RẤT HIẾM (huỷ do sự cố/sai kết quả trước khi công bố) — khác `getDrawSettleReport`
 * (báo cáo mọi kỳ bình thường đã settle). `safeRun()` KHÔNG BAO GIỜ throw. `toToolResult` bắt
 * buộc — report có field `Date`; nó cũng log + làm sạch payload khi lỗi (xem
 * `server/ai/tool-result.ts`).
 */

import { GameProduct } from "@megawin/game-core/entities";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { toToolResult } from "@/server/ai";
import { GetVoidReportDispatchUseCase } from "@/server/ai/reports/get-void-report";

const useCase = new GetVoidReportDispatchUseCase();

const GAME_VALUES = Object.values(GameProduct) as [GameProduct, ...GameProduct[]];

export default defineTool({
  description:
    "Báo cáo kỳ quay ĐÃ HUỶ (void) — kỳ bị huỷ do sự cố/sai kết quả trước khi công bố, tiền cược " +
    "được hoàn lại cho player. Dùng cho câu hỏi kiểu 'kỳ nào bị huỷ tuần này', 'kỳ #095 huỷ hoàn " +
    "lại bao nhiêu tiền cho đại lý nào'. Bỏ trống `drawId` → danh sách kỳ đã void trong khoảng " +
    "`from`..`to` (kết quả thường RẤT ÍT — void hiếm xảy ra). Truyền `drawId` → breakdown theo " +
    "TỪNG đại lý của ĐÚNG kỳ void đó. KHÔNG nhầm với kỳ đã settle bình thường — dùng " +
    "`getDrawSettleReport` cho kỳ đó.",
  inputSchema: z.object({
    game: z.enum(GAME_VALUES).describe("Game cần xem."),
    from: z.string().describe("Ngày tài chính bắt đầu, format YYYY-MM-DD."),
    to: z.string().describe("Ngày tài chính kết thúc, format YYYY-MM-DD."),
    drawId: z.string().optional().describe("Có → breakdown theo đại lý của ĐÚNG kỳ void này."),
  }),
  execute: async (input) => toToolResult(await useCase.safeRun(input), "getVoidReport"),
});
