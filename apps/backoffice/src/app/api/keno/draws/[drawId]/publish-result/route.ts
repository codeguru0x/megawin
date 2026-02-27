import { z } from "zod";

import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { PublishResultUseCase } from "@megawin/game-keno-application/use-cases/draws";
import {
  KENO_DRAW_COUNT,
  KENO_NUMBER_MIN,
  KENO_NUMBER_MAX,
} from "@megawin/game-keno/entities";

const publishResultSchema = z.object({
  winningNumbers: z
    .array(z.number().int().min(KENO_NUMBER_MIN).max(KENO_NUMBER_MAX))
    .length(KENO_DRAW_COUNT, `Phải có đúng ${KENO_DRAW_COUNT} số.`),
  vietlottRef: z
    .object({
      drawPeriod: z.string(),
      drawDate: z.string(),
    })
    .optional(),
});

const publishResultUseCase = new PublishResultUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(publishResultSchema)
  .handler(async ({ params, body }) => {
    const { drawId } = params as { drawId: string };
    return publishResultUseCase.run({ drawId, ...body });
  });
