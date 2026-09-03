import { CompanyRole } from "@megawin/identity/entities";
import { ListSourcesUseCase, UpdateSourceUseCase } from "@megawin/resultfeed-application/use-cases/sources";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

import { updateSourceSchema } from "../_lib/schema";

const listSourcesUseCase = new ListSourcesUseCase();
const updateSourceUseCase = new UpdateSourceUseCase();

/** GET /api/resultfeed/sources — danh sách toàn bộ nguồn thu thập cho trang `sources`. */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Admin] })
  .handler(async () => {
    return listSourcesUseCase.run();
  });

/**
 * POST /api/resultfeed/sources
 *
 * Upsert 1 nguồn — đổi `role`/`trustWeight`/`isEnabled` ảnh hưởng trực tiếp tới thuật toán
 * consensus, nên `UpdateSourceUseCase` tự ghi audit log `resultfeed.update_source`.
 */
export const POST = withApi()
  .auth({ roles: [CompanyRole.Admin] })
  .body(updateSourceSchema)
  .handler(async ({ body, session, request }) => {
    const { sourceId, ...fields } = body;
    return updateSourceUseCase.run({
      sourceId,
      fields,
      actor: actorFromSession(session!, request),
    });
  });
