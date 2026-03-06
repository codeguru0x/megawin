/**
 * Lambda: settle-apply-payout-caps (Keno)
 *
 * Áp dụng giới hạn trả thưởng bậc 8/9/10.
 * Chạy sau SettleEntries, trước SyncTicketSummaries.
 *
 * @input  SettleContext ($settleCtx)
 * @output ApplyPayoutCapsResult
 */

import { ApplyPayoutCapsUseCase } from "@megawin/game-keno-application/use-cases/settle";
import type { SettleContext } from "@megawin/game-keno-application/use-cases/settle";

const useCase = new ApplyPayoutCapsUseCase();

export async function handler(event: SettleContext) {
  return useCase.run(event);
}
