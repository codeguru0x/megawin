import { DetectResettleBoundariesUseCase } from "@megawin/game-power655-application/use-cases/draws";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

import { resettlePreflightSchema } from "../../_lib/schema";

const detectBoundariesUseCase = new DetectResettleBoundariesUseCase();

/**
 * POST /api/power655/draws/[drawId]/resettle-preflight
 *
 * Phân tích tác động trước khi thực hiện Resettle Power 6/55.
 * Staff gọi sau khi có kết quả mới, trước khi nhấn "Kết sổ lại".
 *
 * Trả về:
 *   - `TYPE_A`: có thể tự động hoàn toàn.
 *   - `TYPE_B1`: auto payout + Quản trị hệ thống cập nhật jackpot cycle.
 *   - `TYPE_B2`: cascade step-wise — auto payout từng kỳ, Quản trị hệ thống chốt cycle giữa mỗi bước.
 *   - `LEDGER_MISSING`: kỳ cũ trước khi có Cycle Ledger — Quản trị hệ thống thủ công.
 */
export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(resettlePreflightSchema)
  .handler(async ({ params, body }) => {
    const { drawId } = params as { drawId: string };
    return detectBoundariesUseCase.run({
      drawId,
      proposedWinningMain: body.proposedWinningMain,
      proposedBonusNumber: body.proposedBonusNumber,
    });
  });
