/**
 * Lambda: publish-settle-daily (Max 3D — Void Flow)
 *
 * Re-aggregate per-game draw-level reports → upsert system daily reports.
 * Chạy sau BuildVoidReport: settle reports đã xoá → system totals giảm theo.
 *
 * IDEMPOTENT: re-aggregate toàn bộ → overwrite system reports.
 *
 * @input  VoidContext ($voidCtx)
 * @output PublishSettleDailyResult
 */

import {
  PublishSettleDailyUseCase,
  type VoidContext,
} from "@megawin/game-max3d-application/use-cases/void";

const useCase = new PublishSettleDailyUseCase();

export async function handler(event: VoidContext) {
  return useCase.run(event);
}
