import { ListAlertsUseCase } from "@megawin/game-max3d-application/use-cases/operations";
import { CompanyRole } from "@megawin/identity/entities";

import { withApi } from "@/lib/api";

import { listAlertsQuerySchema } from "../_lib/schema";

const useCase = new ListAlertsUseCase();

/**
 * GET /api/max3d/operations/alerts
 *
 * Staff list alert 1 kỳ (on-demand khi mở panel — KHÔNG timer riêng). Mặc định gộp theo
 * `type` cho badge panel; `grouped=false` để xem raw từng alert khi điều tra. Trả CẢ item
 * `ack` (UI v6 — disclosure per-group, không ẩn).
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(listAlertsQuerySchema)
  .handler(async ({ query }) => {
    return useCase.run({
      drawId: query.drawId,
      status: query.status,
      grouped: query.grouped,
    });
  });
