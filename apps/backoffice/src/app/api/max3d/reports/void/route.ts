import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { ListVoidReportsUseCase } from "@megawin/game-max3d-application/use-cases/reports";
import { z } from "zod";

const querySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

const useCase = new ListVoidReportsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(querySchema)
  .handler(async ({ query }) => useCase.run(query));
