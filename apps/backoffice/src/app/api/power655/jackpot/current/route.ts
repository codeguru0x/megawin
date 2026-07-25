import { GetJackpotCurrentUseCase } from "@megawin/game-power655-application/use-cases/jackpot";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

const getJackpotCurrentUseCase = new GetJackpotCurrentUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    return getJackpotCurrentUseCase.run(undefined);
  });
