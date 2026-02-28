import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { ListJackpotHistoryUseCase } from "@megawin/game-lotto535-application/use-cases/jackpot";

import { jackpotHistoryQuerySchema } from "./_lib/schema";

const listJackpotHistoryUseCase = new ListJackpotHistoryUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(jackpotHistoryQuerySchema)
  .handler(async ({ query }) => {
    return listJackpotHistoryUseCase.run({
      page: query.page,
      size: query.size,
    });
  });
