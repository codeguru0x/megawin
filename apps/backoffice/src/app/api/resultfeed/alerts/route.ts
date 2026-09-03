import { CompanyRole } from "@megawin/identity/entities";
import { ResultFeedAlertStatus } from "@megawin/resultfeed/entities";
import { ListAlertsUseCase } from "@megawin/resultfeed-application/use-cases/alerts";
import { z } from "zod";

import { withApi } from "@/lib/api";

const listAlertsUseCase = new ListAlertsUseCase();

const alertStatusValues = Object.values(ResultFeedAlertStatus) as [ResultFeedAlertStatus, ...ResultFeedAlertStatus[]];

const listAlertsQuerySchema = z.object({
  status: z.enum(alertStatusValues).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * GET /api/resultfeed/alerts?status=&limit=
 *
 * Mặc định `status=new` — hàng đợi alert chưa xử lý cho badge dashboard. `countNew` trong
 * response luôn phản ánh tổng số alert `new`, bất kể `status` filter là gì.
 */
export const GET = withApi()
  .auth({ roles: [CompanyRole.Admin] })
  .query(listAlertsQuerySchema)
  .handler(async ({ query }) => {
    return listAlertsUseCase.run(query);
  });
