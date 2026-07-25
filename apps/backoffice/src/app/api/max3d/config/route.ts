import {
  GetGlobalConfigApiUseCase,
  UpdateGameConfigUseCase,
} from "@megawin/game-max3d-application/use-cases/game-config";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

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
  .handler(async ({ body, session, request }) => {
    return updateGameConfigUseCase.run({
      ...body,
      actor: actorFromSession(session!, request),
    });
  });
