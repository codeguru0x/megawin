import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import {
  GetGlobalConfigApiUseCase,
  UpdateGameConfigUseCase,
} from "@megawin/game-keno-application/use-cases/game-config";

import { updateKenoGameConfigSchema } from "./_lib/schema";

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    const useCase = new GetGlobalConfigApiUseCase();
    return useCase.run();
  });

export const PUT = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(updateKenoGameConfigSchema)
  .handler(async ({ body }) => {
    const useCase = new UpdateGameConfigUseCase();
    return useCase.run(body);
  });
