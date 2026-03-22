import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { GetPlayerOutstandingUseCase } from "@megawin/game-core-application/use-cases/reports";

const getPlayerOutstandingUseCase = new GetPlayerOutstandingUseCase();

/**
 * GET /api/accounts/players/[accountId]/outstanding
 *
 * Query on-demand entries đang chờ (scheduled) của 1 player — cross-game.
 * Không có query params — luôn trả tất cả outstanding entries hiện tại.
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const accountId = (params as { accountId: string }).accountId;
    return getPlayerOutstandingUseCase.run({ accountId });
  });
