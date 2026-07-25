import { GetDashboardKpisUseCase } from "@megawin/game-core-application/use-cases/reports";
import { CompanyRole } from "@megawin/identity/entities";
import { z } from "zod";

import { withApi } from "@/lib/api";

const querySchema = z.object({
  fd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  compare: z
    .string()
    .regex(/^(\d{4}-\d{2}-\d{2})(,\d{4}-\d{2}-\d{2})*$/)
    .optional(),
});

const useCase = new GetDashboardKpisUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(querySchema)
  .handler(async ({ query }) => {
    return useCase.run(query);
  });
