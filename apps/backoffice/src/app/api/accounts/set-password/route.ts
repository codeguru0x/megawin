import { z } from "zod";
import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity-domain/accounts/account";
import { SetAccountPasswordUseCase } from "@megawin/identity-application/use-cases/accounts";

const setPasswordSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(8).max(128),
});

export const POST = withApi()
  .auth({ roles: [CompanyRole.Admin] })
  .body(setPasswordSchema)
  .handler(async ({ body }) => {
    const useCase = new SetAccountPasswordUseCase();
    return useCase.run(body);
  });
