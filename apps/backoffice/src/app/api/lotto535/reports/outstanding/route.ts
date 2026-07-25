import { GetOutstandingReportsUseCase } from "@megawin/game-lotto535-application/use-cases/reports";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => new GetOutstandingReportsUseCase().run());
