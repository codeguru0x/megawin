import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { GetLiveEntriesUseCase } from "@megawin/game-max3d-application/use-cases/operations";
import { liveEntriesQuerySchema } from "../_lib/schema";

const useCase = new GetLiveEntriesUseCase();

/**
 * GET /max3d/operations/live-entries?drawId=xxx&limit=50
 *
 * Trả về N entries mới nhất của một kỳ quay Max 3D.
 * - Kỳ đang bán: client refetch mỗi 30s (React Query refetchInterval)
 * - Kỳ đã settle: gọi 1 lần, hiển thị static
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(liveEntriesQuerySchema)
  .handler(async ({ query }) => {
    return useCase.run({
      drawId: query.drawId,
      limit: query.limit,
    });
  });
