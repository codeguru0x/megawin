import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { GetDrawSelectorUseCase } from "@megawin/game-max3d-application/use-cases/operations";

const useCase = new GetDrawSelectorUseCase();

/**
 * GET /max3d/operations/draw-selector
 *
 * Danh sách kỳ quay cho dropdown chọn kỳ trên dashboard vận hành Max 3D.
 * Trả về 3 nhóm: active (cần xử lý), future (scheduled), recent (48h qua).
 * Max 3D: 3 kỳ/tuần T2/T4/T6 → danh sách ngắn.
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    return useCase.run();
  });
