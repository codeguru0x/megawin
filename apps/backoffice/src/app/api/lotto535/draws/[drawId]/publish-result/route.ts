import { z } from "zod";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";
import { CompanyRole } from "@megawin/identity/entities";
import { PublishResultUseCase } from "@megawin/game-lotto535-application/use-cases/draws";
import {
  lotto535MainNumberSchema,
  lotto535SpecialNumberSchema,
} from "@megawin/game-lotto535/schemas";
import { LOTTO535_MAIN_COUNT } from "@megawin/game-lotto535/entities";

const publishResultSchema = z
  .object({
    winningMain: z
      .array(lotto535MainNumberSchema)
      .length(LOTTO535_MAIN_COUNT, `Phải có đúng ${LOTTO535_MAIN_COUNT} số chính.`),
    winningSpecial: lotto535SpecialNumberSchema,
    vietlottRef: z
      .object({
        drawPeriod: z.string(),
        drawDate: z.string(),
      })
      .optional(),
  })
  .refine((data) => new Set(data.winningMain).size === data.winningMain.length, {
    message: "Các số chính không được trùng nhau.",
    path: ["winningMain"],
  });

const publishResultUseCase = new PublishResultUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(publishResultSchema)
  .handler(async ({ params, body, session }) => {
    const { drawId } = params as { drawId: string };
    return publishResultUseCase.run({ drawId, ...body, actor: actorFromSession(session!) });
  });
