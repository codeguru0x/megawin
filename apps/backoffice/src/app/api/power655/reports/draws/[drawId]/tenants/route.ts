import { ListDrawTenantsUseCase } from "@megawin/game-power655-application/use-cases/reports";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";

const useCase = new ListDrawTenantsUseCase();

const paramsSchema = z.object({
  drawId: z.string().min(1),
});
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .params(paramsSchema)
  .handler(async ({ params }) => {
    const drawId = params.drawId;
    return useCase.run({ drawId });
  });
