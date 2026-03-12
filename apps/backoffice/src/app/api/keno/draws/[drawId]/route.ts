import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { GetDrawDetailUseCase } from "@megawin/game-keno-application/use-cases/draws";

const getDrawDetailUseCase = new GetDrawDetailUseCase();

/**
 * GET /api/keno/draws/[drawId]
 *
 * Lấy chi tiết kỳ quay Keno theo drawId.
 * Dùng cho operations dashboard (DrawCommandCenter, ResultSection).
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const { drawId } = params as { drawId: string };
    return getDrawDetailUseCase.run({ drawId });
  });
