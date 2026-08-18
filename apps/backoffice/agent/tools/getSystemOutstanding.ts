/**
 * Tool eve: `getSystemOutstanding` — tiền đang treo (chưa settle), tổng hợp theo GAME, cross-game.
 *
 * Output là `SystemOutstandingGameDaily[]` — MỘT dòng/game với counter vô hướng (activeDrawCount,
 * totalOutstandingStake, totalEstimatedCommission…), KHÔNG phải danh sách từng kỳ và không có
 * `drawId`. Doc có TTL 300s nên số luôn là "hiện tại", không tra được quá khứ — description phải
 * nói rõ cả hai điều này, nếu không model sẽ chọn tool này cho câu hỏi "kỳ nào đang mở" (đúng tool
 * là `getDrawsOverview`) hoặc cho câu hỏi có mốc ngày.
 *
 * KHÔNG chạm repo/DB trực tiếp — chỉ gọi qua use-case (`app-use-case-layering.mdc` §3).
 * `safeRun()` KHÔNG BAO GIỜ throw, trả nguyên `AppResult<GetSystemOutstandingOutput>` cho
 * model tự đọc — KHÔNG map lại shape để p0-03 render card đúng DTO gốc.
 *
 * Serialize `Date` là BẮT BUỘC ở đây: `SystemOutstandingGameDaily` mang `snapshotAt`/`updatedAt`
 * kiểu `Date`, mà eve reject `Date` ở biên tool (không gọi `toJSON`) → turn chết với
 * "returned a non-JSON-serializable result". `toToolResult` lo việc đó (không đổi shape) và đồng thời
 * log + làm sạch payload khi lỗi (xem `server/ai/tool-result.ts`).
 *
 * Không có input filter — luôn trả tất cả outstanding draws đang active (khớp use-case gốc).
 */

import { GetSystemOutstandingUseCase } from "@megawin/game-core-application/use-cases/reports";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { toToolResult } from "@/server/ai";

const useCase = new GetSystemOutstandingUseCase();

export default defineTool({
  description:
    "TIỀN ĐANG TREO của toàn hệ thống, tổng hợp theo TỪNG GAME (7 game) tại thời điểm hiện tại: " +
    "số kỳ còn active, tổng tiền cược pending, hoa hồng ước tính, số player/tenant đang có vé " +
    "chờ. Dùng cho câu hỏi kiểu 'đang treo bao nhiêu tiền', 'còn bao nhiêu kỳ chưa settle'. " +
    "KHÔNG list từng kỳ và KHÔNG có drawId — cần biết kỳ NÀO đang mở/sắp quay thì dùng " +
    "`getDrawsOverview`; cần chi tiết 1 kỳ thì `getDrawDetail`; cần số ĐÃ SETTLE (đã chốt) thì " +
    "`getFinancialDailyOverview`/`getFinancialByGame` — TUYỆT ĐỐI không trộn tiền treo với tiền " +
    "đã chốt trong cùng một tổng. Số là snapshot làm mới liên tục (chỉ sống ~5 phút), luôn là " +
    "'hiện tại' — không nhận tham số ngày, không tra được quá khứ. Không có tham số đầu vào.",
  inputSchema: z.object({}),
  execute: async () => toToolResult(await useCase.safeRun(), "getSystemOutstanding"),
});
