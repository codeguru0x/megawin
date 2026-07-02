import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";
import { CompanyRole } from "@megawin/identity/entities";
import { TriggerResettleUseCase } from "@megawin/game-bingo18-application/use-cases/draws";
import { env } from "@/env";

const triggerResettleUseCase = new TriggerResettleUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params, session }) => {
    const { drawId } = params as { drawId: string };
    return triggerResettleUseCase.run({
      drawId,
      RESETTLE_SFN_ARN: env.BINGO18_RESETTLE_SFN_ARN!,
      actor: actorFromSession(session!),
    });
  });
