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
 * @input  AutoEnrollInput
 * @output AutoEnrollOutput – { drawId, enrolledCount, skippedCount, entriesCreated, done }
 */

import {
  AutoEnrollEntriesUseCase,
  type AutoEnrollInput,
} from "@megawin/game-keno-application/use-cases/draws";

const useCase = new AutoEnrollEntriesUseCase();

export async function handler(event: AutoEnrollInput) {
  return useCase.run(event);
}
