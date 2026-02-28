import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { GetJackpotCurrentUseCase } from "@megawin/game-lotto535-application/use-cases/jackpot";

const getJackpotCurrentUseCase = new GetJackpotCurrentUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    return getJackpotCurrentUseCase.run(undefined);
  });
