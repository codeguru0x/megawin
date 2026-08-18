/**
 * Tool eve: `getDispatchOrders` — nhật ký lệnh dispatch (trả thưởng/hoàn tiền/thu hồi) sang đại lý,
 * tra theo định danh (tx/batchKey/accountId/username) HOẶC theo filter đa chiều (đại lý/game/
 * trạng thái/loại) + khoảng ngày.
 *
 * KHÔNG chạm repo/DB trực tiếp — chỉ gọi qua use-case (`app-use-case-layering.mdc` §3),
 * `ListDispatchOrdersUseCase` từ `@megawin/tenant-dispatch/use-cases/admin` — package này đã gộp
 * hộ cross-game (không phân biệt theo `GameProduct`), nên KHÔNG cần dispatcher `server/ai/`.
 *
 * KHÁC `getIntegrationHealth` (đã có sẵn — KPI tổng hợp + top 10 order kẹt nhất, không filter được):
 * tool này cho xem CHI TIẾT nhiều order theo đúng điều kiện staff cần tra (vd "order nào của
 * account X", "lệnh trả thưởng tenant Y bị stuck retry cao").
 *
 * `safeRun()` KHÔNG BAO GIỜ throw. `toToolResult` bắt buộc — order có field `createdAt`/
 * `dispatchedAt`/`cancelledAt` dạng `Date`; nó cũng log + làm sạch payload khi lỗi (xem
 * `server/ai/tool-result.ts`).
 */

import { DispatchOrderStatus, DispatchSourceKind } from "@megawin/tenant-dispatch/entities";
import { ListDispatchOrdersUseCase } from "@megawin/tenant-dispatch/use-cases/admin";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { toToolResult } from "@/server/ai";

const useCase = new ListDispatchOrdersUseCase();

const STATUS_VALUES = Object.values(DispatchOrderStatus) as [DispatchOrderStatus, ...DispatchOrderStatus[]];
const SOURCE_KIND_VALUES = Object.values(DispatchSourceKind) as [DispatchSourceKind, ...DispatchSourceKind[]];
const RETRY_MODE_VALUES = ["fresh", "retrying", "stuck"] as const;
const MAX_LIMIT = 100;

export default defineTool({
  description:
    "Nhật ký lệnh dispatch (trả thưởng payout / hoàn tiền refund / thu hồi reversal) gửi sang " +
    "đại lý. Dùng cho câu hỏi kiểu 'order tx ABC trạng thái gì', 'player X có lệnh trả thưởng nào " +
    "chưa', 'lệnh nào của đại lý Y đang retry nhiều'. Truyền BẤT KỲ field định danh (`tx`/" +
    "`batchKey`/`accountId`/`username`) → chỉ dùng field đó để tra, BỎ QUA mọi filter khác (kể cả " +
    "khoảng ngày) — tránh match rỗng khi đã biết chính xác cần tìm gì. KHÔNG truyền field định " +
    "danh nào → lọc theo chiều (đại lý/game/trạng thái/loại lệnh/khoảng ngày). `retryMode: " +
    "\"stuck\"` lọc order đang kẹt retry cao — dùng khi hỏi 'có lệnh nào bị kẹt không' (hoặc dùng " +
    "`getIntegrationHealth` cho top 10 kẹt nhất kèm KPI tổng quan). Kết quả phân trang qua " +
    "`cursor`/`nextCursor` — kết quả chưa hết trang thì phải nói rõ với staff là danh sách chưa đủ.",
  inputSchema: z.object({
    tx: z.string().optional().describe("Mã giao dịch (UUIDv7 idempotency key) — tra 1 order chính xác."),
    batchKey: z.string().optional().describe("Mã batch — tra mọi order trong 1 lần dispatch hàng loạt."),
    accountId: z.string().optional().describe("ID tài khoản player — tra mọi order của 1 player."),
    username: z.string().optional().describe("Username player — tra mọi order của 1 player."),
    tenantId: z.string().optional().describe("Lọc theo 1 đại lý cụ thể."),
    gameId: z.string().optional().describe("Lọc theo game key (keno, lotto535, ...)."),
    status: z.enum(STATUS_VALUES).optional().describe("Lọc theo trạng thái: pending/dispatched/cancelled."),
    sourceKind: z.enum(SOURCE_KIND_VALUES).optional().describe("Lọc theo loại: payout/refund/reversal."),
    retryMode: z
      .enum(RETRY_MODE_VALUES)
      .optional()
      .describe("Lọc theo tình trạng retry: fresh (mới), retrying (đang thử lại), stuck (kẹt nhiều lần)."),
    stuckMinRetry: z.number().int().positive().optional().describe("Ngưỡng retryCount tối thiểu khi retryMode=stuck."),
    from: z.string().optional().describe("Ngày bắt đầu, format YYYY-MM-DD. Bị bỏ qua nếu có field định danh."),
    to: z.string().optional().describe("Ngày kết thúc, format YYYY-MM-DD. Bị bỏ qua nếu có field định danh."),
    cursor: z.string().optional().describe("Cursor trang trước, từ `nextCursor` của lần gọi trước."),
    limit: z
      .number()
      .int()
      .positive()
      .max(MAX_LIMIT)
      .optional()
      .describe("Số dòng mỗi trang, mặc định 50, tối đa 100."),
  }),
  execute: async (input) => toToolResult(await useCase.safeRun(input), "getDispatchOrders"),
});
