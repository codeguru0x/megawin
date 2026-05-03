import { NextApiUseCase } from "@megawin/next/server";

import { DispatchOrderRepository } from "../../infras/repos/dispatch-order-repo";
import type { TenantDispatchOrderEntity } from "../../entities/dispatch-order";

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
export class GetOrderByTxUseCase extends NextApiUseCase<
  GetOrderByTxInput,
  GetOrderByTxOutput
> {
  private readonly repo = new DispatchOrderRepository();

  protected async execute(input: GetOrderByTxInput): Promise<GetOrderByTxOutput> {
    return await this.repo.findByTx(input.tx);
  }
}
