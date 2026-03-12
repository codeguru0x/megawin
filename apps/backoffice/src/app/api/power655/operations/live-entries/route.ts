import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { GetLiveEntriesUseCase } from "@megawin/game-power655-application/use-cases/operations";
import { z } from "zod";

const querySchema = z.object({
  drawId: z.string().min(1, "drawId là bắt buộc."),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const useCase = new GetLiveEntriesUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(querySchema)
  .handler(async ({ query }) => {
    return useCase.run({ drawId: query.drawId, limit: query.limit });
  });
