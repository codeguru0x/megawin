import { CompanyRole } from "@megawin/identity/entities";
import { CancelOrderUseCase } from "@megawin/tenant-dispatch/use-cases/admin";

import { withApi } from "@/lib/api";

import { cancelOrderSchema } from "../_lib/schema";

const useCase = new CancelOrderUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(cancelOrderSchema)
  .handler(async ({ body }) => useCase.run({ tx: body.tx }));
