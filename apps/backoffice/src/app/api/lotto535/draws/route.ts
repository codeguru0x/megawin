import {
  CreateDrawsUseCase,
  type ListDrawsInput,
  ListDrawsUseCase,
} from "@megawin/game-lotto535-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

import { createDrawSchema, listDrawsQuerySchema } from "./_lib/schema";

const createDrawsUseCase = new CreateDrawsUseCase();
const listDrawsUseCase = new ListDrawsUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(createDrawSchema)
  .handler(async ({ body }) => {
    return createDrawsUseCase.run(body);
  });

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(listDrawsQuerySchema)
  .handler(async ({ query }) => {
    return listDrawsUseCase.run({
      status: query.status as ListDrawsInput["status"],
      fromDate: query.fromDate,
      toDate: query.toDate,
      cursor: query.cursor,
      size: query.size,
    });
  });
