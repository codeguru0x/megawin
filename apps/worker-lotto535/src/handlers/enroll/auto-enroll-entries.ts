/**
 * Lambda: auto-enroll-entries
 *
 * Scan tickets multi-draw chưa fully enrolled, tạo entries cho kỳ mới.
 *
 * IDEMPOTENT: ticket enroll $ne guard + entry unique index (ticketId, drawId).
 * Step Function retry-safe.
 */

import { AutoEnrollEntriesUseCase } from "@megawin/game-lotto535-application/use-cases/draws";

interface Input {
  drawId: string;
}

const useCase = new AutoEnrollEntriesUseCase();

export async function handler(event: Input) {
  const result = await useCase.run({ drawId: event.drawId });

  if (!result.success) {
    throw new Error(result.error.message);
  }

  return result.data;
}
