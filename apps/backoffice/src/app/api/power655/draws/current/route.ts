import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetCurrentDrawUseCase } from "@megawin/game-power655-application/use-cases/draws";

const getCurrentDrawUseCase = new GetCurrentDrawUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    return getCurrentDrawUseCase.run();
  });
