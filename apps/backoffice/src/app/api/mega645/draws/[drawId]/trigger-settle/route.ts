import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { TriggerSettleUseCase } from "@megawin/game-mega645-application/use-cases/draws";
import { env } from "@/env";

const triggerSettleUseCase = new TriggerSettleUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const { drawId } = params as { drawId: string };
    return triggerSettleUseCase.run({ drawId, SETTLE_SFN_ARN: env.MEGA645_SETTLE_SFN_ARN! });
  });
