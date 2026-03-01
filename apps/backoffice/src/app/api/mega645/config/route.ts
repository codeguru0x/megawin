import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import {
  GetGlobalConfigApiUseCase,
  UpdateGameConfigUseCase,
} from "@megawin/game-mega645-application/use-cases/game-config";

import { updateGameConfigSchema } from "./_lib/schema";

const getGameConfigUseCase = new GetGlobalConfigApiUseCase();
const updateGameConfigUseCase = new UpdateGameConfigUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    return getGameConfigUseCase.run();
  });

export const PUT = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(updateGameConfigSchema)
  .handler(async ({ body }) => {
    return updateGameConfigUseCase.run(body);
  });
