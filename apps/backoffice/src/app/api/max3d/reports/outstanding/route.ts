import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { GetOutstandingReportsUseCase } from "@megawin/game-max3d-application/use-cases/reports";

const useCase = new GetOutstandingReportsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => useCase.run());
