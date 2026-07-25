import {
  CreateDrawUseCase,
  type ListDrawsInput,
  ListDrawsUseCase,
} from "@megawin/game-keno-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

import { createDrawSchema, listDrawsQuerySchema } from "./_lib/schema";

const createDrawUseCase = new CreateDrawUseCase();
const listDrawsUseCase = new ListDrawsUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(createDrawSchema)
  .handler(async ({ body }) => {
    return createDrawUseCase.run(body, { successStatus: 201 });
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
