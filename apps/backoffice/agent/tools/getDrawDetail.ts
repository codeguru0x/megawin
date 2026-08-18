/**
 * Tool eve: `getDrawDetail` — chi tiết 1 kỳ quay (hoặc kỳ hiện hành) của 1 game.
 *
 * KHÔNG chạm repo/DB trực tiếp — chỉ gọi qua use-case (`app-use-case-layering.mdc` §3), dispatcher
 * `GetDrawSnapshotUseCase` (`server/ai/draws/`) chọn đúng game trước khi gọi
 * `GetDrawDetailUseCase`/`GetCurrentDrawUseCase` của package tương ứng.
 *
 * `safeRun()` KHÔNG BAO GIỜ throw. `toToolResult` bắt buộc — nhiều field draw (`drawTime`,
 * `sales.closeAt`, `result.publishedAt`…) là `Date` ở tầng use-case gốc; nó cũng log + làm sạch
 * payload khi lỗi (xem `server/ai/tool-result.ts`).
 */

import { GameProduct } from "@megawin/game-core/entities";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { toToolResult } from "@/server/ai";
import { GetDrawSnapshotUseCase } from "@/server/ai/draws/get-draw-snapshot";

const useCase = new GetDrawSnapshotUseCase();

const GAME_VALUES = Object.values(GameProduct) as [GameProduct, ...GameProduct[]];

export default defineTool({
  description:
    "Chi tiết 1 kỳ quay của 1 game: trạng thái, giờ mở/đóng bán, doanh thu, kết quả (nếu đã " +
    "công bố), jackpot (nếu game có). Bỏ trống `drawId` để lấy KỲ HIỆN HÀNH (đang mở/sắp mở gần " +
    "nhất) — ưu tiên lấy `drawId` từ `clientContext.page.operations.drawId` nếu staff đang xem " +
    "1 kỳ cụ thể trên trang vận hành. Muốn bức tranh NHIỀU game cùng lúc → dùng `getDrawsOverview`. " +
    "Muốn danh sách NHIỀU kỳ có filter → dùng `listDraws`.",
  inputSchema: z.object({
    game: z.enum(GAME_VALUES).describe("Game cần xem (keno, lotto535, mega645, power655, max3d, max3dpro, bingo18)."),
    drawId: z.string().optional().describe("Mã kỳ quay, format YYYY-MM-DD.NNN. Bỏ trống → kỳ hiện hành."),
  }),
  execute: async (input) => toToolResult(await useCase.safeRun(input), "getDrawDetail"),
});
