/**
 * Tool eve: `getDrawSettleReport` — báo cáo tài chính SỰ KIỆN (đã settle) của 1 game: danh sách
 * kỳ đã settle trong khoảng ngày, hoặc breakdown theo tenant của 1 kỳ cụ thể.
 *
 * KHÔNG chạm repo/DB trực tiếp — chỉ gọi qua use-case (`app-use-case-layering.mdc` §3), dispatcher
 * `GetDrawSettleReportDispatchUseCase` (`server/ai/reports/`) chọn đúng
 * `ListSettleDrawReportsUseCase`/`ListDrawTenantsUseCase` của package tương ứng.
 *
 * Drill-down mà 3 tool tài chính hiện có (`getFinancialByGame`, `getSystemOutstanding`,
 * `getGameJackpot`) KHÔNG xuống được — đây là số ĐÃ SETTLE, khác `getOpsSnapshot` (realtime kỳ
 * đang mở). `safeRun()` KHÔNG BAO GIỜ throw. `toToolResult` bắt buộc — `createdAt`/`updatedAt`
 * của report là `Date`; nó cũng log + làm sạch payload khi lỗi (xem `server/ai/tool-result.ts`).
 */

import { GameProduct } from "@megawin/game-core/entities";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { toToolResult } from "@/server/ai";
import { GetDrawSettleReportDispatchUseCase } from "@/server/ai/reports/get-draw-settle-report";

const useCase = new GetDrawSettleReportDispatchUseCase();

const GAME_VALUES = Object.values(GameProduct) as [GameProduct, ...GameProduct[]];
const MAX_LIMIT = 30;

export default defineTool({
  description:
    "Báo cáo tài chính ĐÃ SETTLE (kỳ đã đóng, số không đổi nữa): doanh thu (totalStake), GGR, " +
    "hoa hồng đại lý, lợi nhuận ròng (netProfit). Dùng cho câu hỏi kiểu 'kỳ hôm qua của Power " +
    "lãi bao nhiêu', 'kỳ #095 đại lý nào đóng doanh thu nhiều nhất'. Bỏ trống `drawId` → danh " +
    "sách các kỳ đã settle trong khoảng `from`..`to` (giới hạn `limit`, tối đa 30/trang — kết " +
    "quả bị cắt sẽ báo qua `meta.result.total`). Truyền `drawId` → breakdown theo TỪNG đại lý " +
    "của ĐÚNG kỳ đó (không phân trang, luôn đủ). KHÔNG dùng tool này cho kỳ ĐANG MỞ (số chưa " +
    "final) — dùng `getOpsSnapshot` cho số realtime. Muốn kỳ nào đang mở/đã settle gần nhất → " +
    "`getDrawsOverview`/`getDrawDetail` trước để lấy đúng `drawId`.",
  inputSchema: z.object({
    game: z.enum(GAME_VALUES).describe("Game cần xem."),
    from: z.string().describe("Ngày tài chính bắt đầu, format YYYY-MM-DD."),
    to: z.string().describe("Ngày tài chính kết thúc, format YYYY-MM-DD."),
    drawId: z.string().optional().describe("Có → breakdown theo đại lý của ĐÚNG kỳ này."),
    page: z.number().int().positive().optional().describe("Trang, mặc định 1. Chỉ áp dụng khi không có drawId."),
    limit: z
      .number()
      .int()
      .positive()
      .max(MAX_LIMIT)
      .optional()
      .describe("Số kỳ mỗi trang, mặc định 10, tối đa 30. Chỉ áp dụng khi không có drawId."),
  }),
  execute: async (input) => toToolResult(await useCase.safeRun(input), "getDrawSettleReport"),
});
