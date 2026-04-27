/**
 * Use Case: Enqueue Dispatch Refunds (Keno).
 *
 * Flow (chunk-based, cursor theo refundTx ASC). Chi tiết tương tự
 * `EnqueueDispatchPayoutsUseCase` nhưng cho voided entries.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { GameProduct } from "@megawin/game-core/entities";
import { buildRefundOrder } from "@megawin/tenant-dispatch/builders";
import { EnqueueDispatchOrdersUseCase } from "@megawin/tenant-dispatch/use-cases/enqueue";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { VoidContext } from "./types";

const BATCH_SIZE = 500;
const MAX_EXECUTION_MS = 10 * 60 * 1000;

export interface EnqueueDispatchRefundsOutput {
  drawId: string;
  batchKey: string;
  done: boolean;
}

export class EnqueueDispatchRefundsUseCase extends InternalUseCase<
  VoidContext,
  EnqueueDispatchRefundsOutput
> {
  private readonly entryRepo = new EntryRepository();
  private readonly enqueueUseCase = new EnqueueDispatchOrdersUseCase();

  protected async execute(input: VoidContext): Promise<EnqueueDispatchRefundsOutput> {
    const { drawId } = input;
    const batchKey = `${GameProduct.Keno}:void:${drawId}:refund`;
    const startTime = Date.now();

    let cursor: string | undefined;

    while (Date.now() - startTime < MAX_EXECUTION_MS) {
      const entries = await this.entryRepo.getVoidedEntriesForDispatch({
        drawId,
        afterTx: cursor,
        limit: BATCH_SIZE,
      });

      if (entries.length === 0) {
        return { drawId, batchKey, done: true };
      }

      const orders = entries.map((e) =>
        buildRefundOrder({
          tx: e.refundTx,
          tenantId: e.tenantId,
          accountId: e.accountId,
          username: e.username,
          amount: e.refundAmount,
          gameId: GameProduct.Keno,
          roundIds: [drawId],
          description: `Hoàn tiền Keno kỳ ${drawId} – kỳ bị huỷ`,
          metadata: { entryId: e.id, ticketNo: e.ticketNo },
          sourceId: e.id,
          sourceContext: { drawId },
          batchKey,
        }),
      );

      await this.enqueueUseCase.run({ orders });

      cursor = entries[entries.length - 1]!.refundTx;

      if (entries.length < BATCH_SIZE) {
        return { drawId, batchKey, done: true };
      }
    }

    return { drawId, batchKey, done: false };
  }
}
