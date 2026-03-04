/**
 * Lambda: auto-enroll-entries
 *
 * Scan tickets multi-draw chưa fully enrolled, tạo entries cho kỳ mới.
 *
 * IDEMPOTENT: ticket enroll $ne guard + entry unique index (ticketId, drawId).
 * Step Function retry-safe.
 */

import {
  AutoEnrollEntriesUseCase,
  type AutoEnrollInput,
} from "@megawin/game-lotto535-application/use-cases/draws";

const useCase = new AutoEnrollEntriesUseCase();

export async function handler(event: AutoEnrollInput) {
  return useCase.run(event);
}
