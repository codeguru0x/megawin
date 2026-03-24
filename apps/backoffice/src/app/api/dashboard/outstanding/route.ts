import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetSystemOutstandingUseCase } from "@megawin/game-core-application/use-cases/reports";

const useCase = new GetSystemOutstandingUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    return useCase.run();
  });
