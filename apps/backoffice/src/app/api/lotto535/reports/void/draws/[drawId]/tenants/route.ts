import { ListVoidDrawTenantsUseCase } from "@megawin/game-lotto535-application/use-cases/reports";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";

const useCase = new ListVoidDrawTenantsUseCase();

const paramsSchema = z.object({
  drawId: z.string().min(1),
});
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .params(paramsSchema)
  .handler(async ({ params }) => {
    const drawId = params.drawId;
    console.log("[void/tenants route] drawId from params:", JSON.stringify(drawId));
    return useCase.run({ drawId });
  });
