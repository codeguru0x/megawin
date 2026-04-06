import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { ListJackpotHistoryByCycleUseCase } from "@megawin/game-power655-application/use-cases/jackpot";

import { jackpotHistoryByCycleQuerySchema } from "../_lib/schema";

const listJackpotHistoryByCycleUseCase = new ListJackpotHistoryByCycleUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(jackpotHistoryByCycleQuerySchema)
  .handler(async ({ query }) => {
    return listJackpotHistoryByCycleUseCase.run({
      cycleNo: query.cycleNo,
      page: query.page,
      size: query.size,
    });
  });
