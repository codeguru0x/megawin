import { z } from "zod";
import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { SetupMfaUseCase } from "@megawin/identity-application/use-cases/accounts";

const setupMfaSchema = z.object({
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

const setupMfaUseCase = new SetupMfaUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(setupMfaSchema)
  .handler(async ({ body, session }) => {
    const username = session!.user.username;

    return setupMfaUseCase.run({
      username,
      password: body.password,
    });
  });
