import { CompanyRole } from "@megawin/identity/entities";
import { GetBatchProgressUseCase } from "@megawin/tenant-dispatch/use-cases/admin";

import { withApi } from "@/lib/api";

import { batchProgressQuerySchema } from "../_lib/schema";

const useCase = new GetBatchProgressUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(batchProgressQuerySchema)
  .handler(async ({ query }) => useCase.run({ batchKey: query.batchKey }));
