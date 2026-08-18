/**
 * Tool eve: `listDraws` — danh sách kỳ quay của 1 game có filter (trạng thái, khoảng ngày).
 *
 * KHÔNG chạm repo/DB trực tiếp — chỉ gọi qua use-case (`app-use-case-layering.mdc` §3), dispatcher
 * `ListDrawsDispatchUseCase` (`server/ai/draws/`) chọn đúng `ListDrawsUseCase` của package tương
 * ứng. `size` trần 30 (thấp hơn route web 20-50) — consumer là context window, không phải bảng ảo.
 *
 * `safeRun()` KHÔNG BAO GIỜ throw. `toToolResult` bắt buộc — `DrawSummary` có field `Date`
 * (`closeAt`, `openAt`…) ở một số game; nó cũng log + làm sạch payload khi lỗi (xem
 * `server/ai/tool-result.ts`).
 */

import { DrawStatus, GameProduct } from "@megawin/game-core/entities";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { toToolResult } from "@/server/ai";
import { ListDrawsDispatchUseCase } from "@/server/ai/draws/list-draws";

const useCase = new ListDrawsDispatchUseCase();

const GAME_VALUES = Object.values(GameProduct) as [GameProduct, ...GameProduct[]];
const STATUS_VALUES = Object.values(DrawStatus) as [DrawStatus, ...DrawStatus[]];
const MAX_SIZE = 30;

export default defineTool({
  description:
    "Danh sách kỳ quay của 1 game, lọc theo trạng thái và/hoặc khoảng ngày. Dùng cho câu hỏi kiểu " +
    "'tuần này Keno quay bao nhiêu kỳ', 'kỳ nào chưa settle'. Muốn CHI TIẾT 1 kỳ cụ thể → dùng " +
    "`getDrawDetail`. `size` tối đa 30 — nếu `meta.truncated` xuất hiện (khi dùng), thu hẹp khoảng " +
    "ngày hoặc lọc theo `status` trước khi gọi lại.",
  inputSchema: z.object({
    game: z.enum(GAME_VALUES).describe("Game cần xem."),
    status: z.enum(STATUS_VALUES).optional().describe("Lọc theo trạng thái kỳ quay."),
    fromDate: z.string().optional().describe("Từ ngày, format YYYY-MM-DD, inclusive."),
    toDate: z.string().optional().describe("Đến ngày, format YYYY-MM-DD, inclusive."),
    page: z.number().int().positive().optional().describe("Trang hiện tại (1-based), mặc định 1."),
    size: z
      .number()
      .int()
      .positive()
      .max(MAX_SIZE)
      .default(10)
      .describe("Số kỳ mỗi trang, mặc định 10, tối đa 30."),
  }),
  execute: async (input) => toToolResult(await useCase.safeRun(input), "listDraws"),
});
