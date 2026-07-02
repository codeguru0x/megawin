import { withApi } from "@/lib/api";
import { actorFromSession } from "@/lib/audit-actor";
import { CompanyRole } from "@megawin/identity/entities";
import { PublishResultUseCase } from "@megawin/game-bingo18-application/use-cases/draws";
import { publishResultSchema } from "../_lib/schema";

const publishResultUseCase = new PublishResultUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(publishResultSchema)
  .handler(async ({ params, body, session }) => {
    const { drawId } = params as { drawId: string };
    return publishResultUseCase.run({ drawId, ...body, actor: actorFromSession(session!) });
  });
