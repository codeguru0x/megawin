import { z } from "zod";

import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { PublishResultUseCase } from "@megawin/game-bingo18-application/use-cases/draws";
import {
  BINGO18_DRAW_COUNT,
  BINGO18_DICE_MIN,
  BINGO18_DICE_MAX,
} from "@megawin/game-bingo18/entities";

const publishResultSchema = z.object({
  numbers: z
    .array(z.number().int().min(BINGO18_DICE_MIN).max(BINGO18_DICE_MAX))
    .length(BINGO18_DRAW_COUNT, `Phải có đúng ${BINGO18_DRAW_COUNT} số.`),
});

const publishResultUseCase = new PublishResultUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(publishResultSchema)
  .handler(async ({ params, body }) => {
    const { drawId } = params as { drawId: string };
    return publishResultUseCase.run({ drawId, ...body });
  });
