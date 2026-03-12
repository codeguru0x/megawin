import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { GetWinningEntriesUseCase } from "@megawin/game-power655-application/use-cases/operations";
import { z } from "zod";

const querySchema = z.object({
  drawId: z.string().min(1, "drawId là bắt buộc."),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const useCase = new GetWinningEntriesUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(querySchema)
  .handler(async ({ query }) => {
    return useCase.run({
      drawId: query.drawId,
      cursor: query.cursor,
      limit: query.limit,
    });
  });
