import { GetGlobalConfigUseCase, UpdateGameConfigUseCase } from "@megawin/game-keno-application/use-cases/game-config";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

import { updateKenoGameConfigSchema } from "./_lib/schema";

const getGlobalConfigUseCase = new GetGlobalConfigUseCase();
const updateGameConfigUseCase = new UpdateGameConfigUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    return getGlobalConfigUseCase.run();
  });

export const PUT = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(updateKenoGameConfigSchema)
  .handler(async ({ body, session, request }) => {
    return updateGameConfigUseCase.run({
      ...body,
      actor: actorFromSession(session!, request),
    });
  });
