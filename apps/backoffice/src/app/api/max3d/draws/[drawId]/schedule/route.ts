import { UpdateScheduleUseCase } from "@megawin/game-max3d-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

const scheduleSchema = z.object({
  salesOpenAt: z.iso.datetime({
    offset: true,
    message: "Thời gian mở bán phải là ISO datetime.",
  }),
  salesCloseAt: z.iso.datetime({
    offset: true,
    message: "Thời gian đóng bán phải là ISO datetime.",
  }),
  drawTime: z.iso.datetime({ offset: true, message: "Giờ quay số phải là ISO datetime." }).optional(),
});

const updateScheduleUseCase = new UpdateScheduleUseCase();

const paramsSchema = z.object({
  drawId: z.string().min(1),
});
export const PATCH = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(scheduleSchema)
  .params(paramsSchema)
  .handler(async ({ params, body, session, request }) => {
    const { drawId } = params;
    return updateScheduleUseCase.run({
      drawId,
      ...body,
      actor: actorFromSession(session!, request),
    });
  });
