import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetDashboardJackpotsUseCase } from "@/app/api/dashboard/jackpots/_lib/get-dashboard-jackpots";

const useCase = new GetDashboardJackpotsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    return useCase.run();
  });
