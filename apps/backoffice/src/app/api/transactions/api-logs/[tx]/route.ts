import { z } from "zod";
import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetTxLogByTxUseCase } from "@megawin/tenant-gateway/use-cases/tx-logs";

const useCase = new GetTxLogByTxUseCase();

const paramsSchema = z.object({
  tx: z.string().min(1),
});

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .params(paramsSchema)
  .handler(async ({ params }) => useCase.run({ tx: params.tx }));
