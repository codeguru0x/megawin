/**
 * Tool eve: `getDrawsOverview` — bức tranh kỳ quay cross-game (7 game) trong 1 call.
 *
 * KHÔNG chạm repo/DB trực tiếp — chỉ gọi qua use-case (`app-use-case-layering.mdc` §3).
 * `safeRun()` KHÔNG BAO GIỜ throw, trả nguyên `AppResult<GetDashboardDrawsOutput>` cho model tự
 * đọc — KHÔNG map lại shape.
 *
 * `toToolResult` là lớp chặn `Date` (output hiện tại đã tự đổi hết sang ISO string trong
 * `GetDashboardDrawsUseCase`) và đồng thời log + làm sạch payload khi lỗi (xem
 * `server/ai/tool-result.ts`).
 *
 * Trả lời "các game đang ở kỳ nào, kỳ nào sắp quay" — muốn CHI TIẾT 1 kỳ cụ thể thì dùng
 * `getDrawDetail`.
 */

import { defineTool } from "eve/tools";
import { z } from "zod";

import { toToolResult } from "@/server/ai";
import { GetDashboardDrawsUseCase } from "@/server/use-cases/draws/get-dashboard-draws";

const useCase = new GetDashboardDrawsUseCase();

export default defineTool({
  description:
    "Bức tranh kỳ quay cross-game (7 game) tại thời điểm hiện tại: kỳ đang mở/đóng bán, kỳ vừa " +
    "settle gần nhất, kỳ sắp tới. Dùng khi câu hỏi kiểu 'các game đang ở kỳ nào', 'kỳ nào sắp " +
    "quay/sắp đóng cổng'. Keno/Bingo18 (tần suất cao) trả summary gộp số lượng, KHÔNG list từng " +
    "kỳ. Muốn CHI TIẾT 1 kỳ cụ thể (đã bán bao nhiêu, đã publish chưa) → dùng `getDrawDetail`. " +
    "Không có tham số đầu vào.",
  inputSchema: z.object({}),
  execute: async () => toToolResult(await useCase.safeRun(), "getDrawsOverview"),
});
