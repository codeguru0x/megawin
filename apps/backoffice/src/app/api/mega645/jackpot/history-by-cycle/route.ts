import { ListJackpotHistoryByCycleUseCase } from "@megawin/game-mega645-application/use-cases/jackpot";

import { withApi } from "@/lib/api";

import { jackpotHistoryByCycleQuerySchema } from "../_lib/schema";

const useCase = new ListJackpotHistoryByCycleUseCase();

/** GET /api/mega645/jackpot/history-by-cycle — lịch sử draws trong 1 Jackpot cycle. */
export const GET = withApi()
  .auth()
  .query(jackpotHistoryByCycleQuerySchema)
  .handler(async ({ query }) => {
    // cycleNo = 0 là sentinel cho active cycle → map sang null.
    const cycleNo = query.cycleNo === 0 ? null : query.cycleNo;
    return useCase.run({ cycleNo, page: query.page, size: query.size });
  });
