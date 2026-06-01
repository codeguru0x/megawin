import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { UpdateVietlottRefUseCase } from "@megawin/game-max3d-application/use-cases/draws";
import { vietlottRefSchema } from "../_lib/schema";

const updateVietlottRefUseCase = new UpdateVietlottRefUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(vietlottRefSchema)
  .handler(async ({ params, body }) => {
    const { drawId } = params as { drawId: string };
    return updateVietlottRefUseCase.run({ drawId, vietlottRef: body });
  });
