/**
 * Tool eve: `getVietlottResult` — kết quả kỳ quay ĐỐI CHIẾU giữa draw nội bộ và ResultFeed
 * (nguồn Vietlott độc lập, tra theo mã kỳ Vietlott).
 *
 * KHÔNG chạm repo/DB trực tiếp — chỉ gọi qua use-case (`app-use-case-layering.mdc` §3), dispatcher
 * `GetVietlottResultComparisonUseCase` (`server/ai/draws/`) tái dùng `GetDrawDetailUseCase`/
 * `GetCurrentDrawUseCase` (giống `getDrawDetail`) + `GetVietlottSuggestionUseCase`/
 * `GetVietlottResultUseCase` của từng game (đã có sẵn cho autofill form publish-result).
 *
 * `safeRun()` KHÔNG BAO GIỜ throw. `toToolResult` lo biên Date→ISO + log lỗi.
 */

import { GameProduct } from "@megawin/game-core/entities";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { toToolResult } from "@/server/ai";
import { GetVietlottResultComparisonUseCase } from "@/server/ai/draws/get-vietlott-result-comparison";

const useCase = new GetVietlottResultComparisonUseCase();
const GAME_VALUES = Object.values(GameProduct) as [GameProduct, ...GameProduct[]];

export default defineTool({
  description:
    "Kết quả 1 kỳ quay, ĐỐI CHIẾU giữa kết quả đã publish trên hệ thống VÀ kết quả tham khảo tra " +
    "được từ Vietlott (nguồn độc lập bên ngoài, tra theo mã kỳ Vietlott suy/xác nhận từ kỳ này). " +
    "Dùng cho câu hỏi 'kết quả kỳ X là gì', 'kết quả kỳ này đúng chưa', 'so kết quả với Vietlott'. " +
    "Bỏ trống `drawId` để lấy KỲ HIỆN HÀNH — ưu tiên lấy từ `clientContext.page.operations.drawId` " +
    "nếu người dùng đang xem 1 kỳ cụ thể trên trang vận hành. LUÔN trả về CẢ 2 nguồn (draw + " +
    "resultFeed) dù khớp hay không — không tự chọn 1 nguồn để trả lời. KHÔNG dùng chữ 'ResultFeed' " +
    "hay bất kỳ thuật ngữ kỹ thuật nào khi trả lời user — chỉ gọi 2 nguồn này là 'kết quả đang có " +
    "trong draw' và 'kết quả tham khảo từ Vietlott' (xem `45-vietlott-result.md`). Nguồn tham khảo " +
    "Vietlott chưa có dữ liệu cho kỳ này (`resultFeed.found=false`) là BÌNH THƯỜNG với kỳ vừa " +
    "đóng/gần mép hiện tại — worker cập nhật nền chưa tới lượt, KHÔNG phải lỗi tool (đã phủ đủ cả 7 " +
    "game). Chỉ cần xem chi tiết 1 kỳ (không cần đối chiếu Vietlott) → dùng `getDrawDetail` (rẻ hơn, " +
    "không tra nguồn tham khảo).",
  inputSchema: z.object({
    game: z.enum(GAME_VALUES).describe("Game cần xem (keno, lotto535, mega645, power655, max3d, max3dpro, bingo18)."),
    drawId: z.string().optional().describe("Mã kỳ quay MegaWin, format YYYY-MM-DD.NNN. Bỏ trống → kỳ hiện hành."),
  }),
  execute: async (input) => toToolResult(await useCase.safeRun(input), "getVietlottResult"),
});
