/**
 * Tool eve: `getFinancialTrend` — chuỗi thời gian tài chính đã chốt, 1 dòng = 1 kỳ (ngày/tuần/tháng).
 *
 * VÌ SAO CÓ TOOL NÀY (sự cố 24/08): hỏi "doanh thu Keno 6 tháng đầu năm" trước đây không có tool
 * nào trả đúng một lần — `getFinancialByGame` gộp cả khoảng (mất trục thời gian),
 * `getFinancialDailyOverview` có trục thời gian nhưng gộp mọi game và chỉ chia theo NGÀY (6 tháng =
 * ~180 dòng, không phải 6). Model buộc phải gọi báo cáo 6 lần rồi tự ghép, và `renderChart` (vẽ
 * NGUYÊN output của MỘT lần gọi) dựng biểu đồ từ lần cuối ⇒ hiện tài chính tháng 6 của cả 7 game
 * trong khi nhận xét nói về Keno 6 tháng. Tool này biến chuỗi cần vẽ thành output của MỘT lần gọi,
 * tức chặn lỗi đó ở gốc thay vì dựa vào instruction.
 *
 * KHÔNG chạm repo/DB trực tiếp — chỉ gọi qua use-case (`app-use-case-layering.mdc` §3).
 * `safeRun()` KHÔNG BAO GIỜ throw, trả nguyên `AppResult<GetGamePeriodTrendOutput>` cho model tự
 * đọc — KHÔNG map lại shape để renderer dựng card đúng DTO gốc. `toToolResult` bọc
 * `serializeDatesVN` + xử lý lỗi ở biên (output hiện toàn primitive nên serialize là no-op).
 */

import { GameProduct } from "@megawin/game-core/entities";
import { GetGamePeriodTrendUseCase } from "@megawin/game-core-application/use-cases/reports";
import { FinancialPeriod } from "@megawin/shared/utils";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { toToolResult } from "@/server/ai";

const useCase = new GetGamePeriodTrendUseCase();

/** `z.enum` cần tuple non-empty — `Object.values` trả mảng thường, cast 1 lần tại đây. */
const GAME_VALUES = Object.values(GameProduct) as [GameProduct, ...GameProduct[]];
const PERIOD_VALUES = Object.values(FinancialPeriod) as [FinancialPeriod, ...FinancialPeriod[]];

export default defineTool({
  description:
    "Tài chính ĐÃ CHỐT theo CHUỖI THỜI GIAN — một dòng cho MỖI KỲ (ngày / tuần / tháng) trong " +
    "khoảng from–to, có thể giới hạn ở MỘT game. Đây là tool ĐÚNG cho mọi câu hỏi dạng xu hướng " +
    "và cho mọi biểu đồ theo thời gian: 'doanh thu Keno 6 tháng đầu năm', 'lợi nhuận theo tuần " +
    "quý này', 'vẽ biểu đồ doanh thu Mega 6/45 theo tháng'. " +
    "GỌI ĐÚNG MỘT LẦN cho cả khoảng: `period` quyết định độ chia (month cho nhiều tháng, week cho " +
    "vài tuần, day cho trong tháng) — TUYỆT ĐỐI KHÔNG gọi lặp từng tháng/từng ngày rồi tự cộng. " +
    "Bỏ `game` = tổng toàn hệ thống theo từng kỳ. " +
    "Cần SO SÁNH giữa các game (xếp hạng, ai cao nhất) → `getFinancialByGame`. Cần tiền còn TREO " +
    "chưa settle → `getSystemOutstanding`. Cần bóc theo đại lý của 1 kỳ quay → " +
    "`getDrawSettleReport`. " +
    "`from`/`to` là NGÀY TÀI CHÍNH (đổi lúc 11:00 giờ VN), lấy từ `financialDate` trong " +
    "`clientContext`. Với `period: month`/`week`, kỳ ở hai đầu khoảng có thể KHÔNG đủ trọn " +
    "tháng/tuần — chỉ gồm những ngày nằm trong from–to.",
  inputSchema: z.object({
    from: z.string().describe("Ngày tài chính bắt đầu, định dạng YYYY-MM-DD."),
    to: z.string().describe("Ngày tài chính kết thúc, định dạng YYYY-MM-DD."),
    period: z
      .enum(PERIOD_VALUES)
      .describe(
        "Độ chia mỗi dòng: day (theo ngày), week (theo tuần, khoá là thứ Hai của tuần), month " +
          "(theo tháng, khoá YYYY-MM). Chọn theo độ dài khoảng: nhiều tháng → month, vài tuần → " +
          "week, trong một tháng → day.",
      ),
    game: z.enum(GAME_VALUES).optional().describe("Chỉ lấy 1 game. Bỏ trống = tổng tất cả game trong mỗi kỳ."),
  }),
  execute: async (input) => toToolResult(await useCase.safeRun(input), "getFinancialTrend"),
});
