import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { CreateDrawsUseCase } from "@megawin/game-lotto535-application/use-cases/draws";

import { createDrawSchema } from "./_lib/schema";

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(createDrawSchema)
  .handler(async ({ body }) => {
    const useCase = new CreateDrawsUseCase();
    return useCase.run(body, { successStatus: 201 });
  });
