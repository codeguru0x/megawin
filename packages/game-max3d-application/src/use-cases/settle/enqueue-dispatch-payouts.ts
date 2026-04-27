/**
 * Use Case: Enqueue Dispatch Payouts (Max 3D).
 *
 * Flow (chunk-based, cursor theo payoutTx ASC):
 *   1. Cursor-paginate winning entries — batch 500.
 *   2. Build `TenantDispatchOrderDoc` qua `buildPayoutOrder`.
 *   3. `bulkEnqueue` vào `tenant_dispatch_orders` (idempotent qua `tx`).
 *   4. Lặp đến khi hết entries hoặc hết thời gian → trả `done`.
 *
 * IDEMPOTENT: Step Function loop lại nếu `done=false`.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { GameProduct } from "@megawin/game-core/entities";
import { buildPayoutOrder } from "@megawin/tenant-dispatch/builders";
import { EnqueueDispatchOrdersUseCase } from "@megawin/tenant-dispatch/use-cases/enqueue";
import { EntryRepository } from "../../infras/repos/entry-repo";

const BATCH_SIZE = 500;
const MAX_EXECUTION_MS = 10 * 60 * 1000;

export interface EnqueueDispatchPayoutsInput {
  drawId: string;
}

export interface EnqueueDispatchPayoutsOutput {
  drawId: string;
  batchKey: string;
  done: boolean;
}

export class EnqueueDispatchPayoutsUseCase extends InternalUseCase<
  EnqueueDispatchPayoutsInput,
  EnqueueDispatchPayoutsOutput
> {
  private readonly entryRepo = new EntryRepository();
  private readonly enqueueUseCase = new EnqueueDispatchOrdersUseCase();

  protected async execute(
    input: EnqueueDispatchPayoutsInput,
  ): Promise<EnqueueDispatchPayoutsOutput> {
    const { drawId } = input;
    const batchKey = `${GameProduct.Max3d}:settle:${drawId}:payout`;
    const startTime = Date.now();

    let cursor: string | undefined;

    while (Date.now() - startTime < MAX_EXECUTION_MS) {
      const entries = await this.entryRepo.getWinningEntriesForDispatch({
        drawId,
        afterTx: cursor,
        limit: BATCH_SIZE,
      });

      if (entries.length === 0) {
        return { drawId, batchKey, done: true };
      }

      const orders = entries.map((e) =>
        buildPayoutOrder({
          tx: e.payoutTx,
          tenantId: e.tenantId,
          accountId: e.accountId,
          username: e.username,
          amount: e.payoutAmount,
          gameId: GameProduct.Max3d,
          roundIds: [drawId],
          description: `Trả thưởng Max 3D kỳ ${drawId}`,
          metadata: { entryId: e.id, ticketNo: e.ticketNo },
          sourceId: e.id,
          sourceContext: { drawId },
          batchKey,
        }),
      );

      await this.enqueueUseCase.run({ orders });

      cursor = entries[entries.length - 1]!.payoutTx;

      if (entries.length < BATCH_SIZE) {
        return { drawId, batchKey, done: true };
      }
    }

    return { drawId, batchKey, done: false };
  }
}
