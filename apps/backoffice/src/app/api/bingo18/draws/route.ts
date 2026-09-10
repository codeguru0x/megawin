import {
  CreateDrawUseCase,
  type ListDrawsInput,
  ListDrawsUseCase,
} from "@megawin/game-bingo18-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

import { invalidateHubSnapshotCache } from "../operations/hub-snapshot/_lib/snapshot-cache";
import { createDrawSchema, listDrawsQuerySchema } from "./_lib/schema";

const createDrawUseCase = new CreateDrawUseCase();
const listDrawsUseCase = new ListDrawsUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(createDrawSchema)
  .handler(async ({ body }) => {
    const result = await createDrawUseCase.run(body);
    // Kỳ mới tạo cũng hiện trên Ops Hub (xem JSDoc `invalidateHubSnapshotCache`).
    invalidateHubSnapshotCache();
    return result;
  });

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(listDrawsQuerySchema)
  .handler(async ({ query }) => {
    return listDrawsUseCase.run({
      status: query.status as ListDrawsInput["status"],
      fromDate: query.fromDate,
      toDate: query.toDate,
      page: query.page,
      size: query.size,
    });
  });
