/**
 * Lambda: settle-apply-payout-caps (Keno)
 *
 * Áp dụng giới hạn trả thưởng bậc 8/9/10.
 * Chạy sau SettleEntries, trước SyncTicketSummaries.
 *
 * @input  ApplyPayoutCapsInput
 * @output ApplyPayoutCapsResult
 */

import {
  ApplyPayoutCapsUseCase,
  type ApplyPayoutCapsInput,
} from "@megawin/game-keno-application/use-cases/settle";

const useCase = new ApplyPayoutCapsUseCase();

export async function handler(event: ApplyPayoutCapsInput) {
  return useCase.run(event);
}
