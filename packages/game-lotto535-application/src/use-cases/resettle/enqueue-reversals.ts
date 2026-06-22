/**
 * Use Case: Enqueue Lotto 5/35 Reversal Orders (Step 2 Resettle SFN).
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
  lockKey: string;
}

export interface EnqueueReversalsOutput {
  drawId: string;
  resettleId: string;
  lockOwnerToken: string;
  lockKey: string;
}

export class EnqueueReversalsUseCase extends InternalUseCase<
  EnqueueReversalsInput,
  EnqueueReversalsOutput
> {
  private readonly entryResettleRepo = new EntryResettleRepository();
  private readonly enqueueUseCase = new EnqueueDispatchOrdersUseCase();

  protected async execute(input: EnqueueReversalsInput): Promise<EnqueueReversalsOutput> {
    const { drawId, resettleId, lockOwnerToken, lockKey } = input;

    const reversalBatchKey = buildResettleBatchKey(
      GameProduct.Lotto535,
      drawId,
      resettleId,
      "reversal",
    );

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
          gameId: GameProduct.Lotto535,
          roundIds: [drawId],
          description: `Thu hồi Lotto 5/35 kỳ ${drawId} (resettle, vé ${e.ticketNo})`,
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

    console.info("[EnqueueReversals Lotto535] done", { drawId, resettleId, enqueuedTotal });

    return {
      drawId,
      resettleId,
      lockOwnerToken,
      lockKey,
    };
  }
}
