import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities/account";
import { GetDrawSelectorUseCase } from "@megawin/game-mega645-application/use-cases/operations";

const useCase = new GetDrawSelectorUseCase();

/**
 * GET /mega645/operations/draw-selector
 *
 * Danh sách kỳ quay cho dropdown chọn kỳ trên dashboard vận hành Mega 6/45.
 * Trả về 3 nhóm: active (cần xử lý), future (scheduled), recent (48h qua).
 * Mega 6/45: 1 kỳ/ngày.
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async () => {
    return useCase.run();
  });
