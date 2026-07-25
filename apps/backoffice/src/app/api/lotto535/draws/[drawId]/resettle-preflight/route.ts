import { DetectResettleBoundariesUseCase } from "@megawin/game-lotto535-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

import { resettlePreflightSchema } from "../../_lib/schema";

const detectBoundariesUseCase = new DetectResettleBoundariesUseCase();

/**
 * POST /api/lotto535/draws/[drawId]/resettle-preflight
 *
 * Phân tích tác động trước khi thực hiện Resettle Lotto 5/35.
 * Staff gọi sau khi có kết quả mới, trước khi nhấn "Kết sổ lại".
 */
export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(resettlePreflightSchema)
  .handler(async ({ params, body }) => {
    const { drawId } = params as { drawId: string };
    return detectBoundariesUseCase.run({
      drawId,
      proposedWinningMain: body.proposedWinningMain,
      proposedWinningSpecial: body.proposedWinningSpecial,
    });
  });
