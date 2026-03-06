import { z } from "zod";

import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { PublishResultUseCase } from "@megawin/game-mega645-application/use-cases/draws";
import {
  MEGA645_MAIN_COUNT,
} from "@megawin/game-mega645/entities";
import { mega645MainNumberSchema } from "@megawin/game-mega645/schemas";

const publishResultSchema = z
  .object({
    winningMain: z
      .array(mega645MainNumberSchema)
      .length(
        MEGA645_MAIN_COUNT,
        `Phải có đúng ${MEGA645_MAIN_COUNT} số chính.`
      ),
    vietlottRef: z
      .object({
        drawPeriod: z.string(),
        drawDate: z.string(),
      })
      .optional(),
  })
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
