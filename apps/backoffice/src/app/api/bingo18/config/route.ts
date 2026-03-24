import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import {
  GetGlobalConfigApiUseCase,
  UpdateGameConfigUseCase,
} from "@megawin/game-bingo18-application/use-cases/game-config";

import { updateBingo18GameConfigSchema } from "./_lib/schema";

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    const useCase = new GetGlobalConfigApiUseCase();
    return useCase.run();
  });

export const PUT = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(updateBingo18GameConfigSchema)
  .handler(async ({ body }) => {
    const useCase = new UpdateGameConfigUseCase();
    return useCase.run(body);
  });
