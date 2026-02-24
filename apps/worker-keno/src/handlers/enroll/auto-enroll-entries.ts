/**
 * Lambda: auto-enroll-entries (Keno)
 *
 * Step Function task: tự động enroll entries cho multi-draw tickets
 * khi 1 kỳ quay mới mở bán.
 *
 * Scan tất cả tickets có drawPlan.fullyEnrolled = false,
 * tạo entry mới cho kỳ hiện tại.
 *
 * IDEMPOTENT:
 *   - Ticket enroll: atomic $ne guard → gọi lại không thay đổi gì
 *   - Entry insert: unique index (ticketId, drawId) → duplicate key → skip
 *   - Step Function có thể retry toàn bộ an toàn
 *
 * @input  { drawId }
 * @output AutoEnrollOutput – { drawId, enrolledCount, skippedCount, entriesCreated, done }
 */

import { AutoEnrollEntriesUseCase } from "@megawin/game-keno-application/use-cases/draws";

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
