import { z } from "zod";

import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { PublishResultUseCase } from "@megawin/game-lotto535-application/use-cases/draws";
import {
  LOTTO535_MAIN_MIN,
  LOTTO535_MAIN_MAX,
  LOTTO535_MAIN_COUNT,
  LOTTO535_SPECIAL_MIN,
  LOTTO535_SPECIAL_MAX,
} from "@megawin/game-lotto535/entities";

const publishResultSchema = z.object({
  winningMain: z
    .array(z.number().int().min(LOTTO535_MAIN_MIN).max(LOTTO535_MAIN_MAX))
    .length(
      LOTTO535_MAIN_COUNT,
      `Phải có đúng ${LOTTO535_MAIN_COUNT} số chính.`
    ),
  winningSpecial: z
    .number()
    .int()
    .min(LOTTO535_SPECIAL_MIN, `Số đặc biệt tối thiểu ${LOTTO535_SPECIAL_MIN}.`)
    .max(LOTTO535_SPECIAL_MAX, `Số đặc biệt tối đa ${LOTTO535_SPECIAL_MAX}.`),
  vietlottRef: z
    .object({
      drawPeriod: z.string(),
      drawDate: z.string(),
      drawSession: z.number(),
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
