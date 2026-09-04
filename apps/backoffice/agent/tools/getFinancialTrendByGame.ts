/**
 * Tool eve: `getFinancialTrendByGame` — SO SÁNH nhiều game trên CÙNG 1 chỉ số theo chuỗi thời gian.
 *
 * VÌ SAO CÓ TOOL NÀY: `getFinancialTrend` chỉ lọc được ĐÚNG 1 game/lần gọi. Hỏi "so sánh doanh
 * thu thuần Keno và Power 6/55 theo tháng" buộc phải gọi `getFinancialTrend` 2 lần (mỗi game 1
 * lần) — và `renderChart` (chế độ đọc-tool-trước) chỉ đọc được MỘT lần gọi gần nhất, nên không
 * thể vẽ chung 1 chart so sánh 2 game theo tháng. Đây là biến thể "nhiều game" của đúng lỗi 24/08
 * đã vá cho "nhiều tháng" (xem JSDoc `apps/backoffice/agent/tools/renderChart.ts` và
 * `getFinancialTrend.ts`). Tool này gộp N lần gọi đó thành MỘT: mỗi dòng trả về là 1 kỳ, mỗi game
 * là 1 cột số riêng — đúng dạng cần để vẽ MỘT biểu đồ cột-nhóm/nhiều-đường so sánh trực tiếp.
 *
 * KHÔNG chạm repo/DB trực tiếp — chỉ gọi qua use-case (`app-use-case-layering.mdc` §3).
 * `safeRun()` KHÔNG BAO GIỜ throw, trả nguyên `AppResult<GetGamePeriodTrendByGameOutput>` cho
 * model tự đọc. `toToolResult` bọc `serializeDatesVN` + xử lý lỗi ở biên.
 */

import { GameProduct } from "@megawin/game-core/entities";
import { GAME_PERIOD_METRIC_KEYS } from "@megawin/game-core-application/repos";
import { GetGamePeriodTrendByGameUseCase } from "@megawin/game-core-application/use-cases/reports";
import { FinancialPeriod } from "@megawin/shared/utils";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { toToolResult } from "@/server/ai";

const useCase = new GetGamePeriodTrendByGameUseCase();

/** `z.enum` cần tuple non-empty — `Object.values` trả mảng thường, cast 1 lần tại đây. */
const GAME_VALUES = Object.values(GameProduct) as [GameProduct, ...GameProduct[]];
const PERIOD_VALUES = Object.values(FinancialPeriod) as [FinancialPeriod, ...FinancialPeriod[]];

/** Tối thiểu 2 game (nếu chỉ 1 game thì dùng `getFinancialTrend`), tối đa 4 (nhiều hơn chart rối). */
const MIN_GAMES = 2;
const MAX_GAMES = 4;

export default defineTool({
  description:
    "SO SÁNH 2-4 game trên CÙNG MỘT chỉ số tài chính theo chuỗi thời gian (ngày/tuần/tháng) — " +
    "một dòng cho MỖI KỲ, mỗi game là 1 cột số riêng trong CÙNG dòng đó. Dùng đúng cho câu hỏi " +
    "dạng 'so sánh doanh thu thuần Keno và Power 6/55 theo tháng', 'lợi nhuận Keno vs Mega 6/45 " +
    "mỗi tuần quý này' — GỌI ĐÚNG MỘT LẦN, KHÔNG gọi `getFinancialTrend` lặp lại theo từng game " +
    "rồi tự ghép (kết quả không thể vẽ chung 1 biểu đồ vì `renderChart` chỉ đọc được lần gọi cuối). " +
    "Chỉ cần xu hướng CỦA MỘT game (không so sánh) → `getFinancialTrend`. Cần so sánh TỔNG cả " +
    "khoảng, không chia theo thời gian → `getFinancialByGame`. " +
    "`metric` là chỉ số DUY NHẤT được so sánh — chọn đúng field khớp câu hỏi (vd 'doanh thu thuần' " +
    "= `ggr`, 'lợi nhuận' = `netProfit`, 'tiền cược' = `totalStake`). " +
    "`from`/`to` là NGÀY TÀI CHÍNH (đổi lúc 11:00 giờ VN), lấy từ `financialDate` trong " +
    "`clientContext`.",
  inputSchema: z.object({
    from: z.string().describe("Ngày tài chính bắt đầu, định dạng YYYY-MM-DD."),
    to: z.string().describe("Ngày tài chính kết thúc, định dạng YYYY-MM-DD."),
    period: z
      .enum(PERIOD_VALUES)
      .describe(
        "Độ chia mỗi dòng: day (theo ngày), week (theo tuần), month (theo tháng). Chọn theo độ " +
          "dài khoảng: nhiều tháng → month, vài tuần → week, trong một tháng → day.",
      ),
    games: z
      .array(z.enum(GAME_VALUES))
      .min(MIN_GAMES)
      .max(MAX_GAMES)
      .describe(
        `Danh sách game cần so sánh, ${MIN_GAMES}-${MAX_GAMES} game. Chỉ 1 game → dùng ` +
          "`getFinancialTrend` thay vì tool này.",
      ),
    metric: z
      .enum(GAME_PERIOD_METRIC_KEYS)
      .describe(
        "Chỉ số DUY NHẤT để so sánh giữa các game: drawCount (kỳ quay), entryCount (phiếu cược), " +
          "playerCount (người chơi), tenantCount (đại lý), totalStake (tiền cược), totalWin " +
          "(tiền thắng), totalPayout (trả thưởng), ggr (doanh thu thuần/GGR), totalCommission " +
          "(hoa hồng đại lý), netProfit (lợi nhuận ròng).",
      ),
  }),
  execute: async (input) => toToolResult(await useCase.safeRun(input), "getFinancialTrendByGame"),
});
