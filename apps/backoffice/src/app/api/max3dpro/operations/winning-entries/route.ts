import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { GetWinningEntriesUseCase } from "@megawin/game-max3dpro-application/use-cases/operations";
import { winningEntriesQuerySchema } from "../_lib/schema";

const useCase = new GetWinningEntriesUseCase();

/**
 * GET /max3dpro/operations/winning-entries?drawId=xxx&cursor=xxx&limit=50
 *
 * Danh sách entries trúng thưởng của một kỳ quay Max 3D Pro, kèm summary kế toán.
 * Chỉ trả về entries đã settle và winAmount > 0.
 * Max 3D Pro: 8 PrizeTier (bao gồm specialSub — Giải phụ Đặc Biệt).
 * Cursor-based pagination: dùng nextCursor từ response để load trang tiếp.
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(winningEntriesQuerySchema)
  .handler(async ({ query }) => {
    return useCase.run({
      drawId: query.drawId,
      cursor: query.cursor,
      limit: query.limit,
    });
  });
