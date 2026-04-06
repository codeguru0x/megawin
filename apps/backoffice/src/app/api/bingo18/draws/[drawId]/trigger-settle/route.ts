import { withApi } from "@/lib/api";
import { env } from "@/env";
import { CompanyRole } from "@megawin/identity/entities";
import { TriggerSettleUseCase } from "@megawin/game-bingo18-application/use-cases/draws";

const triggerSettleUseCase = new TriggerSettleUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const { drawId } = params as { drawId: string };
    return triggerSettleUseCase.run({ drawId, SETTLE_SFN_ARN: env.BINGO18_SETTLE_SFN_ARN! });
  });
