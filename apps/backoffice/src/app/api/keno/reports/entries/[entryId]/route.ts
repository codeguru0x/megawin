import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetEntryByIdUseCase } from "@megawin/game-keno-application/use-cases/reports";

const useCase = new GetEntryByIdUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const { entryId } = params as { entryId: string };
    return useCase.run({ entryId });
  });
