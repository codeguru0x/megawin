import { ListJackpotCyclesUseCase } from "@megawin/game-lotto535-application/use-cases/jackpot";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

import { jackpotCyclesQuerySchema } from "../_lib/schema";

const listJackpotCyclesUseCase = new ListJackpotCyclesUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(jackpotCyclesQuerySchema)
  .handler(async ({ query }) => {
    return listJackpotCyclesUseCase.run({
      page: query.page,
      size: query.size,
    });
  });
