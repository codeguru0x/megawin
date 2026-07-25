import { GetOutstandingReportsUseCase } from "@megawin/game-bingo18-application/use-cases/reports";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

const useCase = new GetOutstandingReportsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => useCase.run({}));
