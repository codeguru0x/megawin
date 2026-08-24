/**
 * Tool eve: `getFinancialByGame` — tổng hợp tài chính hệ thống theo từng game trong range.
 *
 * KHÔNG chạm repo/DB trực tiếp — chỉ gọi qua use-case (`app-use-case-layering.mdc` §3).
 * `safeRun()` KHÔNG BAO GIỜ throw, trả nguyên `AppResult<GetGameSummaryOutput>` cho model
 * tự đọc — KHÔNG map lại shape để p0-03 render card đúng DTO gốc.
 *
 * `serializeDates` chỉ đổi `Date` → ISO string (không đổi shape). `GameSummaryRow` hiện toàn
 * primitive nên là no-op — giữ để DTO có thêm field `Date` sau này không giết turn ở biên
 * serialize của eve (xem `@megawin/shared/utils/serialize`). Bọc trong `toToolResult` để lỗi cũng
 * được log server-side và trả payload sạch cho model (xem `server/ai/tool-result.ts`).
 */

import { GameProduct } from "@megawin/game-core/entities";
import { GetGameSummaryUseCase } from "@megawin/game-core-application/use-cases/reports";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { toToolResult } from "@/server/ai";

const useCase = new GetGameSummaryUseCase();

/** `z.enum` cần tuple non-empty — `Object.values` trả `GameProduct[]`, cast 1 lần tại đây. */
const GAME_VALUES = Object.values(GameProduct) as [GameProduct, ...GameProduct[]];

export default defineTool({
  description:
    "Tài chính ĐÃ CHỐT của hệ thống, một dòng cho MỖI GAME (Keno, Lotto 5/35, Mega 6/45, Power " +
    "6/55, Max 3D, Max 3D Pro, Bingo 18), gộp cả khoảng from–to. Dùng khi câu hỏi so sánh/xếp " +
    "hạng giữa các game: 'game nào doanh thu cao nhất', 'so sánh doanh thu các game tuần này'. " +
    "GỌI MỘT LẦN CHO CẢ KHOẢNG — không gọi lặp từng ngày rồi tự cộng. " +
    "Chỉ hỏi về MỘT game và cần TỔNG cả khoảng (không cần chia theo thời gian) → truyền `game`, " +
    "kết quả còn đúng 1 dòng. Cần số của 1 game THEO TỪNG NGÀY/TUẦN/THÁNG (xu hướng, để vẽ biểu " +
    "đồ đường/cột theo thời gian) → dùng `getFinancialTrend`, KHÔNG gọi tool này nhiều lần. " +
    "KHÔNG bóc theo đại lý (→ `getDrawSettleReport` với `drawId`), KHÔNG gồm tiền còn treo chưa " +
    "settle (→ `getSystemOutstanding`). `from`/`to` là NGÀY TÀI CHÍNH (đổi lúc 11:00 giờ VN), lấy " +
    "từ `financialDate` trong `clientContext`.",
  inputSchema: z.object({
    from: z.string().describe("Ngày tài chính bắt đầu, định dạng YYYY-MM-DD."),
    to: z.string().describe("Ngày tài chính kết thúc, định dạng YYYY-MM-DD."),
    game: z
      .enum(GAME_VALUES)
      .optional()
      .describe("Chỉ lấy 1 game. Bỏ trống = tất cả game (dùng khi so sánh giữa các game)."),
  }),
  execute: async (input) => toToolResult(await useCase.safeRun(input), "getFinancialByGame"),
});
