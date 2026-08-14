import { UseCase } from "@megawin/app-core/use-cases";

import type { TenantDispatchOrderEntity } from "../../entities/dispatch-order";
import { DispatchOrderRepository } from "../../infras/repos/dispatch-order-repo";

export interface ListStuckOrdersInput {
  /** Ngưỡng tối thiểu `retryCount`. Default `RETRY_ALERT_THRESHOLD` (50). */
  minRetryCount?: number;
  /** Filter tenant cụ thể. */
  tenantId?: string;
  limit?: number;
  skip?: number;
}

export interface ListStuckOrdersOutput {
  data: TenantDispatchOrderEntity[];
}

/**
 * BO use case — liệt kê orders đang `Pending` với `retryCount` vượt ngưỡng.
 *
 * Dùng cho trang "Stuck orders" để staff check khi tenant fail kéo dài hoặc nhiều
 * giờ không xử lý xong. Không đổi state order — chỉ read-only.
 */
export class ListStuckOrdersUseCase extends UseCase<ListStuckOrdersInput, ListStuckOrdersOutput> {
  private readonly repo = new DispatchOrderRepository();

  protected async execute(input: ListStuckOrdersInput): Promise<ListStuckOrdersOutput> {
    const data = await this.repo.listStuck({
      minRetryCount: input.minRetryCount,
      tenantId: input.tenantId,
      limit: input.limit,
      skip: input.skip,
    });
    return { data };
  }
}
