/**
 * Tool eve: `getOpsAlerts` — chi tiết alert vận hành (large bet, exposure, combo concentration…)
 * của 1 kỳ, gộp theo loại.
 *
 * KHÔNG chạm repo/DB trực tiếp — chỉ gọi qua use-case (`app-use-case-layering.mdc` §3), dispatcher
 * `GetOpsAlertsDispatchUseCase` (`server/ai/operations/`) chọn đúng `ListAlertsUseCase` của
 * package tương ứng, luôn gọi `grouped: true`.
 *
 * CHỈ ĐỌC — tool này KHÔNG ack alert được (read-only theo kiến trúc, p1-03 §1.1 mục 1). `safeRun()`
 * KHÔNG BAO GIỜ throw. `toToolResult` bắt buộc — alert có field `createdAt`/`ackAt` kiểu `Date`; nó
 * cũng log + làm sạch payload khi lỗi (xem `server/ai/tool-result.ts`).
 */

import { GameProduct } from "@megawin/game-core/entities";
import { OpsAlertStatus } from "@megawin/game-core/types";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { toToolResult } from "@/server/ai";
import { GetOpsAlertsDispatchUseCase } from "@/server/ai/operations/get-ops-alerts";

const useCase = new GetOpsAlertsDispatchUseCase();

const GAME_VALUES = Object.values(GameProduct) as [GameProduct, ...GameProduct[]];
const STATUS_VALUES = Object.values(OpsAlertStatus) as [OpsAlertStatus, ...OpsAlertStatus[]];

export default defineTool({
  description:
    "Danh sách alert vận hành của 1 kỳ, gộp theo loại (large_bet, exposure_threshold, " +
    "combo_concentration…), kèm severity cao nhất mỗi nhóm. Dùng cho câu hỏi 'kỳ này có alert " +
    "chưa xử lý không', 'có cảnh báo exposure không'. Mặc định chỉ lấy alert CHƯA xử lý " +
    "(`status: new`) — truyền `status` khác để xem alert đã ack/resolved. Tool này CHỈ ĐỌC, " +
    "KHÔNG ack được — muốn xử lý alert, chỉ đường vào trang vận hành của game (có thể gợi " +
    "ý `navigateTo`). Muốn CHỈ SỐ ĐẾM alert (không cần chi tiết) → `getOpsSnapshot` đã có " +
    "`alertCounts`, không cần gọi tool này.",
  inputSchema: z.object({
    game: z.enum(GAME_VALUES).describe("Game cần xem."),
    drawId: z.string().describe("Mã kỳ quay, format YYYY-MM-DD.NNN."),
    status: z.enum(STATUS_VALUES).optional().describe("Lọc theo trạng thái xử lý. Mặc định 'new'."),
  }),
  execute: async (input) => toToolResult(await useCase.safeRun(input), "getOpsAlerts"),
});
