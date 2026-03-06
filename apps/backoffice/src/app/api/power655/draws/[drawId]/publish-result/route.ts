import { z } from "zod";

import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { PublishResultUseCase } from "@megawin/game-power655-application/use-cases/draws";
import {
  POWER655_MAIN_COUNT,
} from "@megawin/game-power655/entities";
import { power655MainNumberSchema } from "@megawin/game-power655/schemas";

const publishResultSchema = z
  .object({
    winningMain: z
      .array(power655MainNumberSchema)
      .length(
        POWER655_MAIN_COUNT,
        `Phải có đúng ${POWER655_MAIN_COUNT} số chính.`
      ),
    bonusNumber: power655MainNumberSchema,
    vietlottRef: z
      .object({
        drawPeriod: z.string(),
        drawDate: z.string(),
      })
      .optional(),
  })
  .refine(
    (data) => !data.winningMain.includes(data.bonusNumber),
    { message: "Số bonus không được trùng với số chính.", path: ["bonusNumber"] }
  )
  .refine(
    (data) => new Set(data.winningMain).size === data.winningMain.length,
    { message: "Các số chính không được trùng nhau.", path: ["winningMain"] }
  );

const publishResultUseCase = new PublishResultUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(publishResultSchema)
  .handler(async ({ params, body }) => {
    const { drawId } = params as { drawId: string };
    return publishResultUseCase.run({ drawId, ...body });
  });
