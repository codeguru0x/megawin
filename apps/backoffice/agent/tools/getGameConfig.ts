/**
 * Tool eve: `getGameConfig` — nguồn DUY NHẤT của mọi con số cấu hình 7 game (p1-02 §3).
 *
 * KHÔNG chạm repo/DB trực tiếp — chỉ gọi qua use-case (`app-use-case-layering.mdc` §3).
 *
 * `toToolResult` (thay cho `serializeDates` trước đây) lo cả 2 việc ở biên: đổi `Date`/ISO thành
 * giờ VN (`yyyy-MM-dd HH:mm:ss`), và khi lỗi thì log server-side rồi trả payload SẠCH cho model (không stack, không tên
 * tool, không message kỹ thuật). Xem `server/ai/tool-result.ts` cho ca lỗi thật đã bắt được ở chính
 * tool này.
 *
 * Model PHẢI đọc `label`/`unit`/`note` đi kèm mỗi giá trị — KHÔNG suy nghĩa từ `key` (đường dẫn
 * field chỉ để traceability). Đây là điểm mà `instructions.md` rule 10 nhắc lại.
 */

import { GameProduct } from "@megawin/game-core/entities";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { GameConfigSection, GetGameConfigSnapshotUseCase, toToolResult } from "@/server/ai";

const useCase = new GetGameConfigSnapshotUseCase();

const GAME_VALUES = Object.values(GameProduct) as [GameProduct, ...GameProduct[]];
const SECTION_VALUES = Object.values(GameConfigSection) as [GameConfigSection, ...GameConfigSection[]];

export default defineTool({
  description:
    "Đọc cấu hình hiện hành của 1 trong 7 game (mệnh giá, betCount, tiền từng hạng giải, hoa hồng, " +
    "jackpot seed/ngưỡng, alert vận hành). Đây là nguồn DUY NHẤT cho số liệu cấu hình — KHÔNG dùng " +
    "số từ tài liệu sản phẩm hay từ kiến thức huấn luyện. Câu hỏi cần nhiều nhóm số liệu cùng lúc " +
    '(vd "tổng quan cấu hình game X") → truyền LUÔN nhiều/tất cả section cần trong CÙNG 1 lần gọi ' +
    "(mảng `sections` nhận nhiều giá trị), KHÔNG gọi tool nhiều lần nếu biết trước cần gì. Nếu " +
    "`meta.sectionsNotFetched` có phần đang cần mà lần gọi trước chưa lường tới → gọi lại tool cho " +
    "phần đó, KHÔNG suy đoán; phần nằm trong `sectionsNotApplicable` nghĩa là game này không có mục " +
    "đó. Tool trả cấu hình HIỆN HÀNH — câu hỏi về kỳ ĐÃ KẾT SỔ thì lấy số từ báo cáo kỳ đó (cấu hình " +
    "có thể đã đổi sau kỳ). Muốn số Jackpot ĐANG TÍCH LUỸ (khác seed) dùng `getGameJackpot`; hoa " +
    "hồng RIÊNG 1 đại lý dùng `getTenantGameConfig`.",
  inputSchema: z.object({
    game: z.enum(GAME_VALUES).describe("Game cần đọc cấu hình."),
    sections: z
      .array(z.enum(SECTION_VALUES))
      .optional()
      .describe(
        "Nhóm số liệu cần lấy: play (mệnh giá/betCount/board/lịch quay), rates (hoa hồng/companyRate), " +
          "prizes (bảng giải), jackpot (chỉ lotto535/mega645/power655), ops (ngưỡng alert). Truyền " +
          "được NHIỀU giá trị cùng lúc (vd cả 5) để lấy đủ trong 1 lần gọi khi câu hỏi cần diện rộng. " +
          "Mặc định ['play','rates'] nếu không truyền — dùng mặc định cho câu hỏi hẹp (mệnh giá, hoa hồng).",
      ),
    pickSize: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe(
        "CHỈ dùng cho Keno khi lấy section 'prizes': chọn 1 pick size (1-10) để lấy đúng hàng của " +
          "bảng giải basicPrizes, tránh trả cả ma trận 10 pick × ~11 mức trùng.",
      ),
  }),
  execute: async (input) => toToolResult(await useCase.safeRun(input), "getGameConfig"),
});
