import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { RepublishResultUseCase } from "@megawin/game-keno-application/use-cases/draws";
import { republishResultSchema } from "../_lib/schema";

const republishResultUseCase = new RepublishResultUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(republishResultSchema)
  .handler(async ({ params, body }) => {
    const { drawId } = params as { drawId: string };
    return republishResultUseCase.run({ drawId, ...body });
  });
