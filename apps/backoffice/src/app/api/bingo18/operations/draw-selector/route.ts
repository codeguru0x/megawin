import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { GetDrawSelectorUseCase } from "@megawin/game-bingo18-application/use-cases/operations";

const useCase = new GetDrawSelectorUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    return useCase.run();
  });
