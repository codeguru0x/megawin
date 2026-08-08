/**
 * Use Case: Enqueue Max 3D Pro Reversal Orders (Step 2 của Resettle SFN).
 *
 * Flow (chunk-based, cursor theo `reversal.reversalTx` ASC, chạy hết trong 1 invocation):
 *   1. Cursor-paginate entries có reversal — batch 500.
 *   2. Build `TenantDispatchOrderInput` qua `buildReversalOrder` ở use case layer.
 *   3. `EnqueueDispatchOrdersUseCase.run({ orders })` (validate + bulk insert outbox).
 *   4. Lặp đến khi hết entries → return.
 *
 * **KHÔNG có app-level time cap**: function này CHỈ làm Mongo bulk insert vào
 * `tenant_dispatch_orders` — KHÔNG gọi HTTP tenant API (worker dispatch riêng lo).
 * Scale worst-case (~5K reversals = 10 batches) chạy ~3-10 giây. SFN/Lambda
 * timeout policy là defense layer — nếu DB lag bất thường gây timeout, SFN tự
 * retry từ đầu, idempotent qua outbox unique index `tx`.
 *
 * IDEMPOTENT đa tầng:
 *   - Replay sau crash → cursor reset → duplicate `tx` skip ở outbox unique index.
 *   - Mỗi entry có `reversalTx` UUIDv7 unique → không double-debit.
 *
 * Reversal order specification (set bởi `buildReversalOrder`):
 *   - `action = Debit`, `reason = Adjustment`, `force = true`,
 *     `sourceKind = Reversal`.
 *
 * FIFO outbox per tenant đảm bảo:
 *   - Reversal `createdAt` sớm hơn Payout (enqueue trước trong nested Settle SFN).
 *   - Tenant API nhận Debit trước Credit cho cùng player.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { GameProduct } from "@megawin/game-core/entities";
import { buildResettleBatchKey } from "@megawin/game-core/utils";
import { buildReversalOrder } from "@megawin/tenant-dispatch/builders";
import { EnqueueDispatchOrdersUseCase } from "@megawin/tenant-dispatch/use-cases/enqueue";

import { EntryResettleRepository } from "../../infras/repos/entry-resettle-repo";

const BATCH_SIZE = 500;

export interface EnqueueReversalsInput {
  drawId: string;
  resettleId: string;
  lockOwnerToken: string;
  /** Lock key propagate xuôi SFN tới `FinalizeSettle` (`{game}:resettle:{drawId}`). */
  lockKey: string;
}

/**
 * Output overwrite `$resettleCtx` xuôi SFN. Chỉ chứa fields mà step kế tiếp
 * (`StartSettleExecution` JSONata) thực sự đọc: `drawId`, `resettleId`,
 * `lockOwnerToken`, `lockKey`. Metric `enqueuedTotal` log qua CloudWatch.
 */
export interface EnqueueReversalsOutput {
  drawId: string;
  resettleId: string;
  lockOwnerToken: string;
  lockKey: string;
}

export class EnqueueReversalsUseCase extends InternalUseCase<EnqueueReversalsInput, EnqueueReversalsOutput> {
  private readonly entryResettleRepo = new EntryResettleRepository();
  private readonly enqueueUseCase = new EnqueueDispatchOrdersUseCase();

  protected async execute(input: EnqueueReversalsInput): Promise<EnqueueReversalsOutput> {
    const { drawId, resettleId, lockOwnerToken, lockKey } = input;

    // Build batchKey qua helper centralize ở `@megawin/game-core/utils` —
    // single source of truth, đồng nhất với `payoutBatchKey` ở settle path.
    const reversalBatchKey = buildResettleBatchKey(GameProduct.Max3dpro, drawId, resettleId, "reversal");

    let cursor: string | undefined;
    let enqueuedTotal = 0;

    while (true) {
      const entries = await this.entryResettleRepo.getEntriesWithReversalForDispatch({
        drawId,
        afterTx: cursor,
        limit: BATCH_SIZE,
      });

      if (entries.length === 0) {
        break;
      }

      const orders = entries.map((e) =>
        buildReversalOrder({
          tx: e.reversalTx,
          tenantId: e.tenantId,
          accountId: e.accountId,
          username: e.username,
          amount: e.reversalAmount,
          gameId: GameProduct.Max3dpro,
          roundIds: [drawId],
          description: `Thu hồi Max 3D Pro kỳ ${drawId} (resettle, vé ${e.ticketNo})`,
          metadata: { entryId: e.id, ticketNo: e.ticketNo, resettleId },
          sourceId: e.id,
          sourceContext: { drawId, resettleId, ticketNo: e.ticketNo },
          batchKey: reversalBatchKey,
        }),
      );

      await this.enqueueUseCase.run({ orders });

      cursor = entries[entries.length - 1]!.reversalTx;
      enqueuedTotal += entries.length;

      if (entries.length < BATCH_SIZE) {
        break;
      }
    }

    console.info("[EnqueueReversals] done", { drawId, resettleId, enqueuedTotal });

    return {
      drawId,
      resettleId,
      lockOwnerToken,
      lockKey,
    };
  }
}
