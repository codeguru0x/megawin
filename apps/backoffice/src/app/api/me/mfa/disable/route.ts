import { CompanyRole } from "@megawin/identity/entities";
import { DisableMfaUseCase } from "@megawin/identity-application/use-cases/accounts";
import { z } from "zod";

import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";

const disableMfaSchema = z.object({
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
  totpCode: z
    .string()
    .length(6, "Mã xác thực phải có 6 chữ số")
    .regex(/^\d{6}$/, "Mã xác thực chỉ chứa số"),
});

const disableMfaUseCase = new DisableMfaUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(disableMfaSchema)
  .handler(async ({ body, session, request }) => {
    const username = session!.user.username;

    return disableMfaUseCase.run({
      username,
      password: body.password,
      totpCode: body.totpCode,
      actor: actorFromSession(session!, request),
    });
  });
