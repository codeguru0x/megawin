import { z } from "zod";

import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { PublishResultUseCase } from "@megawin/game-max3dpro-application/use-cases/draws";
import {
  MAX3D_PRO_DRAW_COUNT_SPECIAL,
  MAX3D_PRO_DRAW_COUNT_FIRST,
  MAX3D_PRO_DRAW_COUNT_SECOND,
  MAX3D_PRO_DRAW_COUNT_THIRD,
} from "@megawin/game-max3dpro/entities";

const tripletSchema = z
  .string()
  .regex(/^\d{3}$/, "Bộ ba số phải là 3 chữ số (000-999).");

const publishResultSchema = z.object({
  result: z.object({
    special: z
      .array(tripletSchema)
      .length(
        MAX3D_PRO_DRAW_COUNT_SPECIAL,
        `Giải Đặc Biệt phải có đúng ${MAX3D_PRO_DRAW_COUNT_SPECIAL} bộ ba số.`
      ),
    first: z
      .array(tripletSchema)
      .length(
        MAX3D_PRO_DRAW_COUNT_FIRST,
        `Giải Nhất phải có đúng ${MAX3D_PRO_DRAW_COUNT_FIRST} bộ ba số.`
      ),
    second: z
      .array(tripletSchema)
      .length(
        MAX3D_PRO_DRAW_COUNT_SECOND,
        `Giải Nhì phải có đúng ${MAX3D_PRO_DRAW_COUNT_SECOND} bộ ba số.`
      ),
    third: z
      .array(tripletSchema)
      .length(
        MAX3D_PRO_DRAW_COUNT_THIRD,
        `Giải Ba phải có đúng ${MAX3D_PRO_DRAW_COUNT_THIRD} bộ ba số.`
      ),
  }),
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
    return publishResultUseCase.run({
      drawId,
      result: body.result,
      vietlottRef: body.vietlottRef,
    });
  });
