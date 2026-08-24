/**
 * Tool eve: `getOpsSnapshot` — snapshot vận hành REALTIME của 1 kỳ đang mở: doanh thu, exposure,
 * top combo/account, đếm alert.
 *
 * KHÔNG chạm repo/DB trực tiếp — chỉ gọi qua use-case (`app-use-case-layering.mdc` §3), dispatcher
 * `GetOpsSnapshotDispatchUseCase` (`server/ai/operations/`) chọn đúng
 * `GetOpsSnapshotUseCase` của package tương ứng.
 *
 * KHÔNG đụng cơ chế ETag/304 của route web — tool luôn lấy tươi (số REALTIME, không cache giữa
 * các lượt). `safeRun()` KHÔNG BAO GIỜ throw. `toToolResult` là lớp chặn phòng field `Date` mới, đồng
 * thời log + làm sạch payload khi lỗi (xem `server/ai/tool-result.ts`).
 */

import { GameProduct } from "@megawin/game-core/entities";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { toToolResult } from "@/server/ai";
import { GetOpsSnapshotDispatchUseCase } from "@/server/ai/operations/get-ops-snapshot";

const useCase = new GetOpsSnapshotDispatchUseCase();

const GAME_VALUES = Object.values(GameProduct) as [GameProduct, ...GameProduct[]];

export default defineTool({
  description:
    "Snapshot vận hành REALTIME của 1 kỳ đang mở: doanh thu đang tích luỹ, exposure worst-case, " +
    "top combo/người chơi bị dồn cược, đếm alert (mới/nghiêm trọng). Dùng cho câu hỏi kiểu 'kỳ " +
    "đang mở của Lotto doanh thu bao nhiêu rồi'. `drawId` BẮT BUỘC — lấy từ " +
    "`clientContext.page.operations.drawId` nếu người dùng đang xem 1 kỳ, hoặc gọi `getDrawDetail` " +
    "trước để biết kỳ hiện hành. KHÔNG dùng tool này cho kỳ ĐÃ SETTLE (số không cập nhật nữa) — " +
    "dùng `getDrawSettleReport`. Muốn chi tiết TỪNG alert (không chỉ đếm) → dùng `getOpsAlerts`.",
  inputSchema: z.object({
    game: z.enum(GAME_VALUES).describe("Game cần xem."),
    drawId: z.string().describe("Mã kỳ quay, format YYYY-MM-DD.NNN."),
  }),
  execute: async (input) => toToolResult(await useCase.safeRun(input), "getOpsSnapshot"),
});
