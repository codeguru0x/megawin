import { GetDrawSelectorUseCase } from "@megawin/game-power655-application/use-cases/operations";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

const useCase = new GetDrawSelectorUseCase();

/**
 * GET /power655/operations/draw-selector
 *
 * Danh sách kỳ quay cho dropdown chọn kỳ trên dashboard vận hành Power 6/55.
 * Trả về 3 nhóm: active (cần xử lý), future (scheduled), recent (48h qua).
 * Power 6/55: 3 kỳ/tuần (thứ 3, 5, 7).
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    return useCase.run();
  });
