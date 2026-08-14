import { UseCase } from "@megawin/app-core/use-cases";

import type { TenantDispatchOrderEntity } from "../../entities/dispatch-order";
import type { DispatchOrderStatus, DispatchSourceKind } from "../../entities/enums";
import { DispatchOrderRepository } from "../../infras/repos/dispatch-order-repo";

export interface ListOrdersBySourceInput {
  gameId: string;
  sourceKind: DispatchSourceKind;
  sourceId: string;
  status?: DispatchOrderStatus;
  limit?: number;
  skip?: number;
}

export interface ListOrdersBySourceOutput {
  data: TenantDispatchOrderEntity[];
}

/**
 * BO use case — list tất cả orders liên quan đến 1 (gameId, sourceKind, sourceId).
 *
 * VD: "Entry X của Keno đã có dispatch orders nào?" → gameId=keno, sourceKind=payout, sourceId=entryX.
 */
export class ListOrdersBySourceUseCase extends UseCase<ListOrdersBySourceInput, ListOrdersBySourceOutput> {
  private readonly repo = new DispatchOrderRepository();

  protected async execute(input: ListOrdersBySourceInput): Promise<ListOrdersBySourceOutput> {
    const data = await this.repo.listBySource({
      gameId: input.gameId,
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      status: input.status,
      limit: input.limit,
      skip: input.skip,
    });
    return { data };
  }
}
