/**
 * Tool eve: `getTenantGameConfig` — cấu hình RIÊNG 1 đại lý (hoặc TẤT CẢ đại lý) của 1 game:
 * hoa hồng override, có đang bật cho phép chơi không.
 *
 * KHÔNG chạm repo/DB trực tiếp — chỉ gọi qua use-case (`app-use-case-layering.mdc` §3), dispatcher
 * `GetTenantGameConfigDispatchUseCase` (`server/ai/tenant-config/`) chọn đúng
 * `GetTenantConfigUseCase`/`ListTenantConfigsUseCase` của package tương ứng.
 *
 * Đóng đúng gap `instructions.md` rule 10/13 — trước đây model phải dặn "chưa tra được hoa hồng
 * đại lý", giờ có tool thật. `safeRun()` KHÔNG BAO GIỜ throw. `toToolResult` là lớp chặn phòng
 * field `Date` mới (hiện DTO chỉ có `ConfigItem` primitive), đồng thời log + làm sạch payload khi lỗi
 * (xem `server/ai/tool-result.ts`).
 */

import { GameProduct } from "@megawin/game-core/entities";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { toToolResult } from "@/server/ai";
import { GetTenantGameConfigDispatchUseCase } from "@/server/ai/tenant-config/get-tenant-game-config";

const useCase = new GetTenantGameConfigDispatchUseCase();

const GAME_VALUES = Object.values(GameProduct) as [GameProduct, ...GameProduct[]];

export default defineTool({
  description:
    "Cấu hình RIÊNG 1 đại lý (hoa hồng override, có được phép chơi game không). Dùng cho câu " +
    "hỏi kiểu 'đại lý X hoa hồng Keno bao nhiêu', 'đại lý Y có đang bị khoá game Z không'. " +
    "Bỏ trống `tenantId` → liệt kê TẤT CẢ đại lý đã từng override cấu hình cho game đó (KHÔNG " +
    "phải toàn bộ đại lý trong hệ thống — đại lý chưa override sẽ KHÔNG xuất hiện). Nếu " +
    "`tenantId` truyền vào trả về rows RỖNG, nghĩa là đại lý đó CHƯA override — đang dùng MẶC " +
    "ĐỊNH hệ thống, không phải lỗi; hoa hồng mặc định hệ thống nằm ở `getGameConfig` section " +
    "'rates'. Muốn hỏi commissionRate MẶC ĐỊNH HỆ THỐNG (không phải 1 đại lý cụ thể) → dùng " +
    "`getGameConfig`, KHÔNG dùng tool này.",
  inputSchema: z.object({
    game: z.enum(GAME_VALUES).describe("Game cần xem."),
    tenantId: z.string().optional().describe("ID đại lý. Bỏ trống để liệt kê mọi đại lý đã override."),
  }),
  execute: async (input) => toToolResult(await useCase.safeRun(input), "getTenantGameConfig"),
});
