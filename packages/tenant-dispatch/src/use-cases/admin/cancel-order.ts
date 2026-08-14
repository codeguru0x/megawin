import { UseCase } from "@megawin/app-core/use-cases";

import { DispatchOrderRepository } from "../../infras/repos/dispatch-order-repo";

export interface CancelOrderInput {
  tx: string;
}

export interface CancelOrderOutput {
  cancelled: boolean;
}

/**
 * BO use case — huỷ 1 order (chỉ khi `status` = pending/failed).
 *
 * Sau khi cancel, worker không bao giờ dispatch order này nữa.
 * Orders `dispatched` không thể cancel — cần reversal flow (Giai đoạn 2).
 */
export class CancelOrderUseCase extends UseCase<CancelOrderInput, CancelOrderOutput> {
  private readonly repo = new DispatchOrderRepository();

  protected async execute(input: CancelOrderInput): Promise<CancelOrderOutput> {
    const cancelled = await this.repo.cancelOrder(input.tx);
    return { cancelled };
  }
}
