import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { GetDrawSelectorUseCase } from "@megawin/game-lotto535-application/use-cases/operations";

const useCase = new GetDrawSelectorUseCase();

/**
 * GET /lotto535/operations/draw-selector
 *
 * Danh sách kỳ quay cho dropdown chọn kỳ trên dashboard vận hành.
 * Trả về 3 nhóm: active (cần xử lý), future (scheduled), recent (48h qua).
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    return useCase.run();
  });
