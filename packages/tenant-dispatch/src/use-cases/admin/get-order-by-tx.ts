import { UseCase } from "@megawin/app-core/use-cases";

import type { TenantDispatchOrderEntity } from "../../entities/dispatch-order";
import { DispatchOrderRepository } from "../../infras/repos/dispatch-order-repo";

export interface GetOrderByTxInput {
  tx: string;
}

export type GetOrderByTxOutput = TenantDispatchOrderEntity | null;

/**
 * BO use case — tra 1 dispatch order theo `tx` (UUIDv7 idempotency key).
 *
 * Dùng cho drawer chi tiết. Trả về `null` khi không tìm thấy — FE
 * xử lý empty state. Không throw lỗi cho "not found".
 */
export class GetOrderByTxUseCase extends UseCase<GetOrderByTxInput, GetOrderByTxOutput> {
  private readonly repo = new DispatchOrderRepository();

  protected async execute(input: GetOrderByTxInput): Promise<GetOrderByTxOutput> {
    return await this.repo.findByTx(input.tx);
  }
}
