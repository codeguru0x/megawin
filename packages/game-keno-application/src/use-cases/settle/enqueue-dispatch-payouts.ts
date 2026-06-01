/**
 * Use Case: Enqueue Dispatch Payouts (Keno).
 *
 * Flow (chunk-based, cursor theo payoutTx ASC):
 *   1. Cursor-paginate winning entries — batch 500.
 *   2. Build `TenantDispatchOrderDoc` qua `buildPayoutOrder`.
 *   3. `bulkEnqueue` vào `tenant_dispatch_orders` (idempotent qua `tx`).
 *   4. Lặp đến khi hết entries hoặc hết thời gian → trả `done`.
 *
 * IDEMPOTENT: Step Function loop lại nếu `done=false`.
 *
 * RESETTLE PATH:
 * - `resettleContext` present → derive batchKey resettle (`{game}:resettle:
 *   {drawId}:{resettleId}:payout`) thay vì batchKey settle mặc định, suffix
 *   description " (resettle)". Convention naming centralize ở đây để giữ
 *   contract `ResettleContext` gọn (xem JSDoc `ResettleContext`).
 * - Outbox FIFO per tenant đảm bảo: order Reversal (Debit) đã enqueue trước với
 *   `createdAt` sớm hơn → chạy trước Payout (Credit) cho cùng player.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { GameProduct } from "@megawin/game-core/entities";
import { buildResettleBatchKey } from "@megawin/game-core/utils";
import { buildPayoutOrder } from "@megawin/tenant-dispatch/builders";
import { EnqueueDispatchOrdersUseCase } from "@megawin/tenant-dispatch/use-cases/enqueue";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { ResettleContext } from "./types";

const BATCH_SIZE = 500;
const MAX_EXECUTION_MS = 10 * 60 * 1000;

export interface EnqueueDispatchPayoutsInput {
  drawId: string;
  /** Marker resettle path — propagate từ `SettleContext`. Absent = settle lần đầu. */
  resettleContext?: ResettleContext;
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
    const { drawId, resettleContext } = input;

    // Resettle path dùng batchKey riêng để separate metrics + audit so với
    // settle lần đầu. Cùng draw có thể có nhiều resettleId qua nhiều phiên.
    // Convention naming KHỚP với `EnqueueReversalsUseCase.reversalBatchKey`
    // (chỉ khác kind suffix `payout` vs `reversal`).
    const batchKey = resettleContext
      ? buildResettleBatchKey(GameProduct.Keno, drawId, resettleContext.resettleId, "payout")
      : `${GameProduct.Keno}:settle:${drawId}:payout`;
    const descSuffix = resettleContext ? " (resettle)" : "";

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
          gameId: GameProduct.Keno,
          roundIds: [drawId],
          description: `Trả thưởng Keno kỳ ${drawId}${descSuffix}`,
          metadata: { entryId: e.id, ticketNo: e.ticketNo },
          sourceId: e.id,
          sourceContext: {
            drawId,
            ...(resettleContext ? { resettleId: resettleContext.resettleId } : {}),
          },
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
