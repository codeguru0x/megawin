import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { GetOutstandingReportsUseCase } from "@megawin/game-lotto535-application/use-cases/reports";

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => new GetOutstandingReportsUseCase().run());
