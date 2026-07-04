import { z } from "zod";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";
import { CompanyRole } from "@megawin/identity/entities";
import { UpdateScheduleUseCase } from "@megawin/game-mega645-application/use-cases/draws";

const scheduleSchema = z.object({
  salesOpenAt: z.iso.datetime({
    offset: true,
    message: "Thời gian mở bán phải là ISO datetime.",
  }),
  salesCloseAt: z.iso.datetime({
    offset: true,
    message: "Thời gian đóng bán phải là ISO datetime.",
  }),
  drawTime: z.iso
    .datetime({ offset: true, message: "Giờ quay số phải là ISO datetime." })
    .optional(),
});

const updateScheduleUseCase = new UpdateScheduleUseCase();

export const PATCH = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(scheduleSchema)
  .handler(async ({ params, body, session, request }) => {
    const { drawId } = params as { drawId: string };
    return updateScheduleUseCase.run({ drawId, ...body, actor: actorFromSession(session!, request) });
  });
