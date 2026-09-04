/**
 * Tool eve: `getVietlottSuggestion` — mã kỳ Vietlott GỢI Ý (CHƯA xác nhận), tính từ dữ liệu tham
 * chiếu Vietlott + lịch quay đã lưu trong game config.
 *
 * KHÁC `getVietlottResult`: tool đó đối chiếu kết quả ĐÃ CÓ (draw ↔ Vietlott thật qua ResultFeed);
 * tool này chỉ tính toán — dùng khi CHƯA publish, cần biết trước mã kỳ Vietlott tương ứng (điền
 * form công bố kết quả), hoặc chỉ muốn biết 1 thời điểm bất kỳ rơi vào kỳ Vietlott nào.
 *
 * KHÔNG chạm repo/DB trực tiếp — chỉ gọi qua use-case (`app-use-case-layering.mdc` §3), dispatcher
 * `GetVietlottSuggestionDispatchUseCase` (`server/ai/draws/`) tái dùng `GetVietlottSuggestionUseCase`
 * của từng game (mode `drawId`) hoặc tự đọc `GetGlobalConfigUseCase` + gọi `suggestVietlottPeriod`
 * (`game-core`) trực tiếp (mode `drawDate`+`drawTime`).
 *
 * `safeRun()` KHÔNG BAO GIỜ throw. `toToolResult` lo biên Date→ISO(VN) + log lỗi.
 */

import { GameProduct } from "@megawin/game-core/entities";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { toToolResult } from "@/server/ai";
import { GetVietlottSuggestionDispatchUseCase } from "@/server/ai/draws/get-vietlott-suggestion";

const useCase = new GetVietlottSuggestionDispatchUseCase();
const GAME_VALUES = Object.values(GameProduct) as [GameProduct, ...GameProduct[]];

export default defineTool({
  description:
    "Mã kỳ Vietlott GỢI Ý (CHƯA xác nhận) cho 1 kỳ MegaWin hoặc 1 thời điểm quay tuỳ ý — dùng cho " +
    "câu hỏi 'kỳ này ứng với mã kỳ Vietlott nào', 'giờ quay X thì rơi vào kỳ Vietlott nào', hoặc khi " +
    "cần biết trước mã kỳ Vietlott TRƯỚC KHI publish kết quả. Truyền `drawId` cho 1 kỳ MegaWin ĐÃ " +
    "TỒN TẠI; hoặc truyền cả `drawDate` + `drawTime` cho 1 THỜI ĐIỂM TUỲ Ý chưa gắn kỳ nào (không cần " +
    "kỳ đó có thật). Chỉ cần 1 trong 2 cách, KHÔNG truyền cả hai. " +
    "TRẢ LỜI USER: CHỈ nói đây là mã kỳ GỢI Ý, khi nhập/công bố kết quả PHẢI xác nhận lại với dữ liệu " +
    "Vietlott thật — TUYỆT ĐỐI KHÔNG giải thích cách tính ra số này (không nhắc 'cấu hình', 'công " +
    "thức', 'lịch quay', hay bất kỳ chi tiết kỹ thuật nào). " +
    "KHÁC `getVietlottResult`: đây CHỈ là gợi ý, KHÔNG tra dữ liệu Vietlott thật — muốn xem hoặc đối " +
    "chiếu KẾT QUẢ đã công bố, dùng `getVietlottResult`. Nếu `suggestion.reason` khác null (không " +
    "suy được), đọc `guidance` trong output để biết cách nói với user — KHÔNG tự đề xuất user đổi " +
    "game config chỉ để tool này ra số, trừ khi có xác nhận THẬT từ Vietlott.",
  inputSchema: z
    .object({
      game: z.enum(GAME_VALUES).describe("Game cần xem (keno, lotto535, mega645, power655, max3d, max3dpro, bingo18)."),
      drawId: z.string().optional().describe("Mã kỳ quay MegaWin ĐÃ TỒN TẠI, format YYYY-MM-DD.NNN."),
      drawDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Ngày quay tuỳ ý, format YYYY-MM-DD."),
      drawTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .optional()
        .describe("Giờ quay tuỳ ý (giờ VN), format HH:mm (24h)."),
    })
    .refine((v) => v.drawId !== undefined || (v.drawDate !== undefined && v.drawTime !== undefined), {
      message: "Phải truyền `drawId`, hoặc cả `drawDate` và `drawTime`.",
    }),
  execute: async (input) => toToolResult(await useCase.safeRun(input), "getVietlottSuggestion"),
});
