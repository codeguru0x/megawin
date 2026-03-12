import { z } from "zod";

import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { UpdateScheduleUseCase } from "@megawin/game-lotto535-application/use-cases/draws";

const scheduleSchema = z.object({
  salesOpenAt: z.iso.datetime({ offset: true }),
  salesCloseAt: z.iso.datetime({ offset: true }),
  drawTime: z.iso.datetime({ offset: true }).optional(),
});

const updateScheduleUseCase = new UpdateScheduleUseCase();

export const PATCH = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(scheduleSchema)
  .handler(async ({ params, body }) => {
    const { drawId } = params as { drawId: string };
    return updateScheduleUseCase.run({ drawId, ...body });
  });
