import { CompanyRole } from "@megawin/identity/entities";
import { ListWorkersHealthUseCase } from "@megawin/worker-core/use-cases/admin";

import { withApi } from "@/lib/api";

const useCase = new ListWorkersHealthUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Admin] })
  .handler(async () => useCase.run());
