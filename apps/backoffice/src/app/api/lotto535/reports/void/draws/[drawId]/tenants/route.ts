import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { ListVoidDrawTenantsUseCase } from "@megawin/game-lotto535-application/use-cases/reports";

const useCase = new ListVoidDrawTenantsUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const drawId = (await params).drawId as string;
    console.log("[void/tenants route] drawId from params:", JSON.stringify(drawId));
    return useCase.run({ drawId });
  });
