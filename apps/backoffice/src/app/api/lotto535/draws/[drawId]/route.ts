import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { GetDrawDetailUseCase } from "@megawin/game-lotto535-application/use-cases/draws";

const useCase = new GetDrawDetailUseCase();

/**
 * GET /lotto535/draws/:drawId
 *
 * Chi tiết đầy đủ 1 kỳ quay: result, jackpot snapshot, financial, stats, settleSummary.
 * Dùng cho dashboard vận hành để hiển thị kết quả & tài chính.
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params }) => {
    const { drawId } = params as { drawId: string };
    return useCase.run({ drawId });
  });
