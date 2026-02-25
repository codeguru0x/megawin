import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import {
  GetGameConfigUseCase,
  UpdateGameConfigUseCase,
} from "@megawin/game-lotto535-application/use-cases/game-config";

import { updateGameConfigSchema } from "./_lib/schema";

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    const useCase = new GetGameConfigUseCase();
    return useCase.run();
  });

export const PUT = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(updateGameConfigSchema)
  .handler(async ({ body }) => {
    const useCase = new UpdateGameConfigUseCase();
    return useCase.run(body);
  });
