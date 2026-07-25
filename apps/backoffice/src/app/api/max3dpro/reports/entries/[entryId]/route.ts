import { GetEntryByIdUseCase } from "@megawin/game-max3dpro-application/use-cases/reports";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

const useCase = new GetEntryByIdUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const { entryId } = params as { entryId: string };
    return useCase.run({ entryId });
  });
