import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { PreviewDrawsUseCase } from "@megawin/game-max3dpro-application/use-cases/draws";

import { previewDrawsSchema } from "../_lib/schema";

const previewDrawsUseCase = new PreviewDrawsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(previewDrawsSchema)
  .handler(async ({ query }) => {
    return previewDrawsUseCase.run({
      count: query.count,
    });
  });
