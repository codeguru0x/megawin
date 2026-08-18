/**
 * Tool eve: `getJackpotHistory` — lịch sử Jackpot ĐÃ ĐÓNG của 1 game (lotto535/mega645/power655):
 * danh sách các vòng đã chia/trúng, hoặc diễn biến từng kỳ trong 1 vòng cụ thể.
 *
 * KHÔNG chạm repo/DB trực tiếp — chỉ gọi qua use-case (`app-use-case-layering.mdc` §3), dispatcher
 * `GetJackpotHistoryDispatchUseCase` (`server/ai/jackpot/`) chọn đúng
 * `ListJackpotCyclesUseCase`/`ListJackpotHistoryByCycleUseCase` của package tương ứng.
 *
 * KHÁC `getGameJackpot` (số ĐANG TÍCH LUỸ, biến thiên liên tục) — tool này chỉ trả SỰ KIỆN đã
 * chốt: vòng đã đóng (ai trúng/chia bao nhiêu) hoặc kỳ đã settle trong vòng đó. Chỉ áp dụng cho 3
 * game CÓ Jackpot — `keno`/`max3d`/`max3dpro`/`bingo18` không có tool này áp dụng.
 *
 * `safeRun()` KHÔNG BAO GIỜ throw. `toToolResult` bắt buộc — cycle/draw có field
 * `startedAt`/`closedAt`/`drawTime` dạng ISO string lẫn Date tuỳ tầng; nó cũng log + làm sạch
 * payload khi lỗi (xem `server/ai/tool-result.ts`).
 */

import { JackpotGameProduct } from "@megawin/game-core/entities";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { toToolResult } from "@/server/ai";
import { GetJackpotHistoryDispatchUseCase } from "@/server/ai/jackpot/get-jackpot-history";

const useCase = new GetJackpotHistoryDispatchUseCase();

const GAME_VALUES = Object.values(JackpotGameProduct) as [JackpotGameProduct, ...JackpotGameProduct[]];
const MAX_LIMIT = 20;

export default defineTool({
  description:
    "Lịch sử Jackpot ĐÃ ĐÓNG của 1 game (chỉ áp dụng lotto535/mega645/power655 — 3 game CÓ " +
    "jackpot). Dùng cho câu hỏi kiểu 'vòng jackpot trước ai trúng, bao nhiêu tiền', 'jackpot đã " +
    "chia mấy lần rồi'. Bỏ trống `cycleNo` → danh sách các VÒNG đã đóng (winner/chia giải, tổng " +
    "đóng góp mỗi vòng, giới hạn `limit` tối đa 20/trang). Truyền `cycleNo` → diễn biến TỪNG KỲ " +
    "quay trong ĐÚNG vòng đó (opening/closing/contribution mỗi kỳ). KHÔNG dùng cho số ĐANG TÍCH " +
    "LUỸ hiện tại (dùng `getGameJackpot`) — tool này chỉ có dữ liệu vòng ĐÃ đóng.",
  inputSchema: z.object({
    game: z.enum(GAME_VALUES).describe("Game cần xem — chỉ lotto535/mega645/power655."),
    cycleNo: z.number().int().positive().optional().describe("Số thứ tự vòng jackpot. Có → xem diễn biến từng kỳ."),
    page: z.number().int().positive().optional().describe("Trang, mặc định 1."),
    limit: z.number().int().positive().max(MAX_LIMIT).optional().describe("Số dòng mỗi trang, mặc định 10, tối đa 20."),
  }),
  execute: async (input) => toToolResult(await useCase.safeRun(input), "getJackpotHistory"),
});
