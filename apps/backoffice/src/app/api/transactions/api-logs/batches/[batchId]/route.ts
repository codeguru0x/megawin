import { CompanyRole } from "@megawin/identity/entities";
import { ListTxLogsByBatchUseCase } from "@megawin/tenant-gateway/use-cases/tx-logs";
import { z } from "zod";

import { withApi } from "@/lib/api";

import { listBatchTxLogsQuerySchema } from "../../_lib/schema";

const useCase = new ListTxLogsByBatchUseCase();

const paramsSchema = z.object({
  batchId: z.string().min(1),
});

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .params(paramsSchema)
  .query(listBatchTxLogsQuerySchema)
  .handler(async ({ params, query }) =>
    useCase.run({
      batchId: params.batchId,
      limit: query.limit,
      cursor: query.cursor,
    }),
  );
