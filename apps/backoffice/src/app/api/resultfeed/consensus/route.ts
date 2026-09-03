import { CompanyRole } from "@megawin/identity/entities";
import { ListConsensusUseCase } from "@megawin/resultfeed-application/use-cases/consensus";

import { withApi } from "@/lib/api";

import { listConsensusQuerySchema } from "../_lib/schema";

const listConsensusUseCase = new ListConsensusUseCase();

/**
 * GET /api/resultfeed/consensus?state=&gameKey=&cursor=&limit=
 *
 * List consensus cho trang `review` (filter `state=conflict`) và `dashboard` (không filter
 * state — xem toàn cảnh). Cursor-based `(updatedAt, id)` mới nhất trước.
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Admin] })
  .query(listConsensusQuerySchema)
  .handler(async ({ query }) => {
    return listConsensusUseCase.run(query);
  });
