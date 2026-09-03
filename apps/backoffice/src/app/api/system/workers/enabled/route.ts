import { CompanyRole } from "@megawin/identity/entities";
import { SetWorkerEnabledUseCase } from "@megawin/worker-core/use-cases/admin";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

import { setWorkerEnabledSchema } from "../_lib/schema";

const useCase = new SetWorkerEnabledUseCase();

export const PATCH = withApi()
  .auth({ roles: [CompanyRole.Admin] })
  .body(setWorkerEnabledSchema)
  .handler(async ({ body, session, request }) => useCase.run({ ...body, actor: actorFromSession(session!, request) }));
