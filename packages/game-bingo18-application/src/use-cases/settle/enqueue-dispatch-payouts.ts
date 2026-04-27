/**
 * Use Case: Enqueue Dispatch Payouts (Bingo 18).
 *
 * Step thay thế cho DispatchPayouts loop cũ.
 *
 * Flow (chunk-based, cursor theo payoutTx ASC):
 *   1. Cursor-paginate winning entries của `drawId` — batch 500.
 *   2. Build `TenantDispatchOrderDoc` cho mỗi entry qua `buildPayoutOrder`.
 *   3. `bulkEnqueue` vào `tenant_dispatch_orders` (idempotent qua `tx`).
 *   4. Lặp đến khi hết entries hoặc hết thời gian → trả `done`.
 *
 * Dispatch thực tế sang tenant chạy bởi `apps/worker-tenant-dispatch`
 * (EventBridge 1 phút/lần). Settle không chờ.
 *
 * IDEMPOTENT: gọi lại cùng drawId sau crash → `bulkEnqueue` skip các `tx` đã tồn tại.
 * Step Function chịu trách nhiệm loop lại nếu `done=false`.
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
  /** true khi đã enqueue hết tất cả winners → kết thúc loop. */
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
    const batchKey = `${GameProduct.Bingo18}:settle:${drawId}:payout`;
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
          gameId: GameProduct.Bingo18,
          roundIds: [drawId],
          description: `Trả thưởng Bingo 18 kỳ ${drawId}`,
          metadata: { entryId: e.id, ticketNo: e.ticketNo },

          // Source tracking (INTERNAL MegaWin)
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
