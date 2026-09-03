import { CompanyRole } from "@megawin/identity/entities";
import { GetDashboardStatsUseCase } from "@megawin/resultfeed-application/use-cases/dashboard";

import { withApi } from "@/lib/api";

const getDashboardStatsUseCase = new GetDashboardStatsUseCase();

/**
 * GET /api/resultfeed/dashboard
 *
 * Đếm consensus theo state (toàn cục + theo game) + số alert `new` chưa xử lý — dữ liệu cho
 * trang `(main)/resultfeed/page.tsx`.
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Admin] })
  .handler(async () => {
    return getDashboardStatsUseCase.run();
  });
