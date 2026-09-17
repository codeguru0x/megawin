import { GetEntryByIdUseCase } from "@megawin/game-mega645-application/use-cases/reports";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";

const useCase = new GetEntryByIdUseCase();

const paramsSchema = z.object({
  entryId: z.string().min(1),
});
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .params(paramsSchema)
  .handler(async ({ params }) => {
    const { entryId } = params;
    return useCase.run({ entryId });
  });
