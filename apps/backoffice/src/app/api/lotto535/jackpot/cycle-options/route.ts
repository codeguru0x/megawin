import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { ListAllJackpotCycleOptionsUseCase } from "@megawin/game-lotto535-application/use-cases/jackpot";

const useCase = new ListAllJackpotCycleOptionsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    return useCase.run({});
  });
