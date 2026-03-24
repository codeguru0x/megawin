import { z } from "zod";
import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { VerifyAndEnableMfaUseCase } from "@megawin/identity-application/use-cases/accounts";

const verifyMfaSchema = z.object({
  totpCode: z
    .string()
    .length(6, "Mã xác thực phải có 6 chữ số")
    .regex(/^\d{6}$/, "Mã xác thực chỉ chứa số"),
  accessToken: z.string().min(1, "Access token is required"),
});

const verifyAndEnableMfaUseCase = new VerifyAndEnableMfaUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(verifyMfaSchema)
  .handler(async ({ body, session }) => {
    const username = session!.user.username;

    return verifyAndEnableMfaUseCase.run({
      username,
      totpCode: body.totpCode,
      accessToken: body.accessToken,
    });
  });
