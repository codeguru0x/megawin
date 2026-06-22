import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { TriggerResettleUseCase } from "@megawin/game-lotto535-application/use-cases/draws";
import { env } from "@/env";

import { triggerResettleSchema } from "../../_lib/schema";

const triggerResettleUseCase = new TriggerResettleUseCase();

/**
 * POST /api/lotto535/draws/[drawId]/resettle
 *
 * Khởi động phiên kết sổ lại (Resettle) Lotto 5/35.
 */
export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(triggerResettleSchema)
  .handler(async ({ params, body }) => {
    const { drawId } = params as { drawId: string };
    return triggerResettleUseCase.run({
      drawId,
      RESETTLE_SFN_ARN: env.LOTTO535_RESETTLE_SFN_ARN,
      dbaConfirmed: body.dbaConfirmed,
    });
  });
