/**
 * Tool eve: `getGameJackpot` — số jackpot ĐANG TÍCH LUỸ, khác hẳn `getGameConfig` (p1-02 §3.4).
 *
 * `getGameConfig` chỉ có mức seed lúc mở chu kỳ mới; muốn số dư hiện tại PHẢI qua tool này.
 * KHÔNG chạm repo/DB trực tiếp — chỉ gọi qua use-case (`app-use-case-layering.mdc` §3).
 * `safeRun()` KHÔNG BAO GIỜ throw, trả nguyên `AppResult<GetGameJackpotOutput>` cho model tự đọc.
 *
 * `toToolResult` lo biên: đổi `Date` còn sót thành ISO string, và khi lỗi thì log server-side rồi
 * trả payload sạch cho model (xem `server/ai/tool-result.ts`). Use-case hiện tại đã tự đổi `asOf`
 * thành ISO string trong `JackpotMeta`.
 *
 * Không truyền `game` → trả cả 3 game có jackpot (mega645, lotto535, power655 — power655 trả 2
 * khối JP1/JP2 riêng biệt).
 */

import { JackpotGameProduct } from "@megawin/game-core/entities";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { GetGameJackpotUseCase, toToolResult } from "@/server/ai";

const useCase = new GetGameJackpotUseCase();

const JACKPOT_GAME_VALUES = Object.values(JackpotGameProduct) as [JackpotGameProduct, ...JackpotGameProduct[]];

export default defineTool({
  description:
    "Đọc số Jackpot ĐANG TÍCH LUỸ (số dư live) của mega645/lotto535/power655. KHÔNG dùng " +
    "getGameConfig cho câu hỏi này — config chỉ có mức seed lúc mở chu kỳ mới, không phải số hiện " +
    "tại. Power 6/55 trả 2 khối riêng (Jackpot 1, Jackpot 2). Không truyền `game` để lấy cả 3.",
  inputSchema: z.object({
    game: z
      .enum(JACKPOT_GAME_VALUES)
      .optional()
      .describe("Chỉ lấy jackpot của 1 game. Bỏ trống để lấy cả mega645, lotto535, power655."),
  }),
  execute: async (input) => toToolResult(await useCase.safeRun(input), "getGameJackpot"),
});
