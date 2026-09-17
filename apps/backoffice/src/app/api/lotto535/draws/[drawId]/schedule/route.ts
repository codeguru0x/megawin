import { UpdateScheduleUseCase } from "@megawin/game-lotto535-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

const scheduleSchema = z.object({
  salesOpenAt: z.iso.datetime({ offset: true }),
  salesCloseAt: z.iso.datetime({ offset: true }),
  drawTime: z.iso.datetime({ offset: true }).optional(),
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
    return updateScheduleUseCase.run({ drawId, ...body, actor: actorFromSession(session!, request) });
  });
