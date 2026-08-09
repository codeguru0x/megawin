/**
 * Lambda: resettle-enqueue-reversals (Max 3D)
 *
 * Step 2 của Max 3D Resettle SFN.
 *
 * Cursor-paginate entries có reversal snapshot (batch 500), build reversal
 * orders qua `buildReversalOrder` và bulk insert vào outbox
 * `tenant_dispatch_orders`. Chạy HẾT entries trong 1 invocation — KHÔNG
 * self-loop qua SFN Choice. Lambda timeout là defense layer; SFN Catch + Wait
 * 60s sẽ retry full nếu fail (idempotent qua outbox unique index `tx`).
 *
 * @input  EnqueueReversalsInput
 * @output EnqueueReversalsOutput
 */

import {
  type EnqueueReversalsInput,
  EnqueueReversalsUseCase,
} from "@megawin/game-max3d-application/use-cases/resettle";

const useCase = new EnqueueReversalsUseCase();

export async function handler(event: EnqueueReversalsInput) {
  return useCase.run(event);
}
