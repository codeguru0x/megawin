import { GetDrawSelectorUseCase } from "@megawin/game-max3dpro-application/use-cases/operations";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

const useCase = new GetDrawSelectorUseCase();

/**
 * GET /max3dpro/operations/draw-selector
 *
 * Danh sách kỳ quay cho dropdown chọn kỳ trên dashboard vận hành Max 3D Pro.
 * Trả về 3 nhóm: active (cần xử lý), future (scheduled), recent (48h qua).
 * Max 3D Pro: 3 kỳ/tuần T3/T5/T7 → danh sách ngắn.
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    return useCase.run();
  });
