import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetCurrentDrawUseCase } from "@megawin/game-mega645-application/use-cases/draws";
import { DrawStatus } from "@megawin/game-core/entities";

const getCurrentDrawUseCase = new GetCurrentDrawUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    return getCurrentDrawUseCase.run({
      allowStatuses: [
        DrawStatus.Scheduled,
        DrawStatus.SalesOpen,
        DrawStatus.SalesClosed,
        DrawStatus.Published,
        DrawStatus.Settling,
        DrawStatus.Voiding,
      ],
    });
  });
