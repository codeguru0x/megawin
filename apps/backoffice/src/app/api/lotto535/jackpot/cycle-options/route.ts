import { ListAllJackpotCycleOptionsUseCase } from "@megawin/game-lotto535-application/use-cases/jackpot";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

const useCase = new ListAllJackpotCycleOptionsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    return useCase.run({});
  });
