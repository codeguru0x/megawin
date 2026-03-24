import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetWinningEntriesUseCase } from "@megawin/game-lotto535-application/use-cases/operations";
import { z } from "zod";

const useCase = new GetWinningEntriesUseCase();

/**
 * GET /lotto535/operations/winning-entries?drawId=xxx&cursor=xxx&limit=50
 *
 * Danh sách entries trúng thưởng của một kỳ quay, kèm summary kế toán.
 * Chỉ trả về entries đã settle và winAmount > 0.
 * Cursor-based pagination: dùng nextCursor từ response để load trang tiếp.
 */
const schema = z.object({
  drawId: z.string().min(1, "drawId là bắt buộc."),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(schema)
  .handler(async ({ query }) => {
    return useCase.run({
      drawId: query.drawId,
      cursor: query.cursor,
      limit: query.limit,
    });
  });
