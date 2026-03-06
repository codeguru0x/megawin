import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { TriggerSettleUseCase } from "@megawin/game-lotto535-application/use-cases/draws";
import { env } from "@/env";

const triggerSettleUseCase = new TriggerSettleUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const { drawId } = params as { drawId: string };
    return triggerSettleUseCase.run({
      drawId,
      LOTTO535_SETTLE_SFN_ARN: env.LOTTO535_SETTLE_SFN_ARN!,
    });
  });
