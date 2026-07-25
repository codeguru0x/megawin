import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

import { GetDashboardDrawsUseCase } from "./_lib/get-dashboard-draws";

const useCase = new GetDashboardDrawsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    return useCase.run();
  });
