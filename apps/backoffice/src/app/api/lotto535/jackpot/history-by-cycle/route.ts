import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { ListJackpotHistoryByCycleUseCase } from "@megawin/game-lotto535-application/use-cases/jackpot";
import { z } from "zod";
import { Pagination } from "@megawin/shared/constants";

const querySchema = z.object({
  /** cycleNo = 0 → vòng hiện tại (active), > 0 → vòng cụ thể */
  cycleNo: z.coerce.number().int().min(0).default(0),
  page: z.coerce.number().int().min(1).default(Pagination.Default.Page),
  size: z.coerce
    .number()
    .int()
    .min(1)
    .max(Pagination.Max.Size)
    .default(Pagination.Default.Size),
});

const useCase = new ListJackpotHistoryByCycleUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(querySchema)
  .handler(async ({ query }) => {
    return useCase.run({
      // cycleNo = 0 là sentinel cho "active cycle"
      cycleNo: query.cycleNo === 0 ? null : query.cycleNo,
      page: query.page,
      size: query.size,
    });
  });
