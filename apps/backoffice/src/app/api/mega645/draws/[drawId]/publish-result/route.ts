import { z } from "zod";

import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { PublishResultUseCase } from "@megawin/game-mega645-application/use-cases/draws";
import {
  MEGA645_NUMBER_COUNT,
} from "@megawin/game-mega645/entities";
import { mega645NumberSchema } from "@megawin/game-mega645/schemas";

const publishResultSchema = z
  .object({
    winningNumbers: z
      .array(mega645NumberSchema)
      .length(
        MEGA645_NUMBER_COUNT,
        `Phải có đúng ${MEGA645_NUMBER_COUNT} số chính.`
      ),
    vietlottRef: z
      .object({
        drawPeriod: z.string(),
        drawDate: z.string(),
      })
      .optional(),
  })
  .refine(
    (data) => new Set(data.winningNumbers).size === data.winningNumbers.length,
    { message: "Các số chính không được trùng nhau.", path: ["winningNumbers"] }
  );

const publishResultUseCase = new PublishResultUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(publishResultSchema)
  .handler(async ({ params, body }) => {
    const { drawId } = params as { drawId: string };
    return publishResultUseCase.run({ drawId, ...body });
  });
