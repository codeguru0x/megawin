import { z } from "zod";
import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";
import { CompanyRole } from "@megawin/identity/entities";
import { SetAccountPasswordUseCase } from "@megawin/identity-application/use-cases/accounts";

const setPasswordSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(8).max(128),
});

const useCase = new SetAccountPasswordUseCase();

// Staff được phép đổi pass (cho Staff khác); Admin (super role) tự động pass.
// Phân quyền chi tiết "Staff không đổi pass Admin" enforce trong use case dựa trên callerRoles.
export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(setPasswordSchema)
  .handler(async ({ body, session, request }) => {
    const callerRoles = (session?.user.roles ?? []) as CompanyRole[];
    return useCase.run({
      ...body,
      callerRoles,
      actor: actorFromSession(session!, request),
    });
  });
