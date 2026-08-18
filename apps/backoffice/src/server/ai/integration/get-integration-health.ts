/**
 * Use Case: Get Integration Health (app-level, aggregate 3 nguồn — p1-03 §2.8)
 *
 * Điểm truy cập DUY NHẤT để tool `getIntegrationHealth` trả lời "hệ thống có ổn không" trong 1
 * call — gộp `GetDispatchSummaryUseCase` (KPI dispatch), `ListStuckOrdersUseCase` (limit 10,
 * order kẹt retry) từ `@megawin/tenant-dispatch/use-cases/admin`, và `ListWorkersHealthUseCase`
 * từ `@megawin/worker-core/use-cases/admin`.
 *
 * `tryLoad` bọc từng nguồn — 1 nguồn lỗi (DB down, timeout) chỉ đánh dấu block đó
 * `unavailable: true`, KHÔNG giết cả response (partial degradation, p1-03 §2.8). Log lỗi thật
 * (không phải NOT_FOUND nghiệp vụ) qua `scope`/`source` để trace — xem JSDoc `tryLoad`.
 *
 * Đặt dưới `server/ai/` (không `server/use-cases/`) vì aggregate CHỈ tồn tại cho model — không
 * route Next.js nào cần gộp 3 nguồn theo shape này (mỗi trang admin đã có route riêng).
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { AppException } from "@megawin/shared/errors";
import { tryLoad } from "@megawin/shared/utils";
import { GetDispatchSummaryUseCase, ListStuckOrdersUseCase } from "@megawin/tenant-dispatch/use-cases/admin";
import { ListWorkersHealthUseCase } from "@megawin/worker-core/use-cases/admin";

import type { GetIntegrationHealthInput, GetIntegrationHealthOutput, IntegrationHealthBlock } from "./types";

const SCOPE = "GetIntegrationHealth";

/** Trần cứng cho stuck orders — tool AI, không phải bảng ảo hoá web (p1-03 §1.1 mục 2). */
const STUCK_ORDERS_LIMIT = 10;

const dispatchSummaryUseCase = new GetDispatchSummaryUseCase();
const stuckOrdersUseCase = new ListStuckOrdersUseCase();
const workersHealthUseCase = new ListWorkersHealthUseCase();

/** Bọc kết quả `tryLoad` thành {@link IntegrationHealthBlock} — `undefined` → `unavailable: true`. */
function toBlock<T>(data: T | undefined): IntegrationHealthBlock<T> {
  return data === undefined ? { unavailable: true } : { unavailable: false, data };
}

export class GetIntegrationHealthUseCase extends UseCase<GetIntegrationHealthInput, GetIntegrationHealthOutput> {
  protected async execute(input: GetIntegrationHealthInput): Promise<GetIntegrationHealthOutput> {
    const { from, to, tenantId } = input;

    const [dispatchSummary, stuckOrders, workersHealth] = await Promise.all([
      tryLoad(() => dispatchSummaryUseCase.run({ from, to, tenantId }), { scope: SCOPE, source: "dispatchSummary" }),
      tryLoad(() => stuckOrdersUseCase.run({ tenantId, limit: STUCK_ORDERS_LIMIT }), {
        scope: SCOPE,
        source: "stuckOrders",
      }),
      tryLoad(() => workersHealthUseCase.run(), { scope: SCOPE, source: "workersHealth" }),
    ]);

    if (dispatchSummary === undefined && stuckOrders === undefined && workersHealth === undefined) {
      throw AppException.serviceUnavailable("Không đọc được bất kỳ nguồn dữ liệu tích hợp nào.");
    }

    return {
      meta: { from, to, tenantId, fetchedAt: new Date().toISOString() },
      dispatchSummary: toBlock(dispatchSummary),
      stuckOrders: toBlock(stuckOrders),
      workersHealth: toBlock(workersHealth),
    };
  }
}
