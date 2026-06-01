import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { PublishResultUseCase } from "@megawin/game-max3d-application/use-cases/draws";
import { publishResultSchema } from "../_lib/schema";

const publishResultUseCase = new PublishResultUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(publishResultSchema)
  .handler(async ({ params, body }) => {
    const { drawId } = params as { drawId: string };
    return publishResultUseCase.run({
      drawId,
      result: body.result,
      vietlottRef: body.vietlottRef,
    });
  });
