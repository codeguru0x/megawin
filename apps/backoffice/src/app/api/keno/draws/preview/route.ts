import { PreviewDrawsUseCase } from "@megawin/game-keno-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

import { previewDrawsSchema } from "../_lib/schema";

const previewDrawsUseCase = new PreviewDrawsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(previewDrawsSchema)
  .handler(async ({ query }) => {
    return previewDrawsUseCase.run({
      drawDate: query.drawDate,
    });
  });
