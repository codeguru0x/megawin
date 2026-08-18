/**
 * Tool eve: `getFinancialDailyOverview` — báo cáo tài chính hệ thống theo ngày trong range.
 *
 * KHÔNG chạm repo/DB trực tiếp — chỉ gọi qua use-case (`app-use-case-layering.mdc` §3).
 * `safeRun()` KHÔNG BAO GIỜ throw, trả nguyên `AppResult<GetDailyOverviewOutput>` cho model
 * tự đọc — KHÔNG map lại shape để p0-03 render card đúng DTO gốc.
 *
 * `toToolResult` bọc `serializeDates` (đổi `Date` → ISO string, không đổi shape) + xử lý lỗi ở biên.
 * Nhánh aggregate hiện tại toàn primitive nên serialize là no-op, nhưng use-case CÓ nhánh trả raw doc
 * (`input.date`) mang `createdAt`/`updatedAt` kiểu Date — eve reject Date ở biên tool và giết cả turn.
 * Giữ lớp chặn ở đây để lúc mở `date` ra inputSchema không tái diễn lỗi 16/08 của
 * `getSystemOutstanding`.
 */

import { GetDailyOverviewUseCase } from "@megawin/game-core-application/use-cases/reports";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { toToolResult } from "@/server/ai";

const useCase = new GetDailyOverviewUseCase();

export default defineTool({
  description:
    "Báo cáo tài chính ĐÃ CHỐT của hệ thống, một dòng cho MỖI NGÀY trong khoảng from–to (doanh " +
    "thu, trả thưởng, hoa hồng, lợi nhuận). Dùng khi câu hỏi cần số theo NGÀY: 'doanh thu hôm " +
    "nay', 'so với hôm qua', 'xu hướng 7 ngày qua'. " +
    "GỌI MỘT LẦN CHO CẢ KHOẢNG: cần tổng/trung bình/xu hướng của nhiều ngày thì truyền trọn " +
    "`from`..`to` rồi tính bằng `python3` trên kết quả — TUYỆT ĐỐI KHÔNG gọi lặp từng ngày " +
    "(90 ngày là 1 lần gọi, không phải 90 lần). " +
    "Cần chia theo GAME thay vì theo ngày → `getFinancialByGame`. Cần tiền còn TREO chưa settle " +
    "→ `getSystemOutstanding`. Cần bóc theo đại lý của 1 kỳ → `getDrawSettleReport`. " +
    "`from`/`to` là NGÀY TÀI CHÍNH (đổi lúc 11:00 giờ VN), lấy từ `financialDate` trong " +
    "`clientContext` — không phải ngày lịch.",
  inputSchema: z.object({
    from: z.string().describe("Ngày tài chính bắt đầu, định dạng YYYY-MM-DD."),
    to: z.string().describe("Ngày tài chính kết thúc, định dạng YYYY-MM-DD."),
  }),
  execute: async (input) => toToolResult(await useCase.safeRun(input), "getFinancialDailyOverview"),
});
