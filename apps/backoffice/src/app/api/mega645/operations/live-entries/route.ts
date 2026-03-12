import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { GetLiveEntriesUseCase } from "@megawin/game-mega645-application/use-cases/operations";
import { z } from "zod";

const useCase = new GetLiveEntriesUseCase();

/**
 * GET /mega645/operations/live-entries?drawId=xxx&limit=50
 *
 * Trả về N entries mới nhất của một kỳ quay Mega 6/45.
 * - Kỳ đang bán: client refetch mỗi 30s (React Query refetchInterval)
 * - Kỳ đã settle: gọi 1 lần, hiển thị static
 */
const liveEntriesQuerySchema = z.object({
  drawId: z.string().min(1, "drawId là bắt buộc."),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(liveEntriesQuerySchema)
  .handler(async ({ query }) => {
    return useCase.run({
      drawId: query.drawId,
      limit: query.limit,
    });
  });
