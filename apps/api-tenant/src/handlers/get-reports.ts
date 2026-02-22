/**
 * Lambda handler: GET /tenant/reports/revenue
 * Tenant xem báo cáo doanh thu.
 * Auth: API Key (server-to-server).
 */

import middy from "@middy/core";
import { z } from "zod";

import {
  validatorZodMiddleware,
  httpErrorHandlerUseCaseFormat,
  type TenantContext,
} from "@megawin/app-core/lambda/middleware";

import {
  toApiGatewayResponse,
} from "@megawin/app-core/use-cases";

import { tenantAuth } from "@megawin/identity-application/shared";

// ============ Zod schema ============

const querySchema = z.object({
  from: z.string().min(1, "from date required"),
  to: z.string().min(1, "to date required"),
  gameId: z.string().optional(),
  groupBy: z.enum(["day", "week", "month"]).optional(),
});

// ============ Handler ============

interface ValidatedEvent {
  validated: {
    queryStringParameters: z.infer<typeof querySchema>;
  };
  tenantContext: TenantContext;
}

export const handler = middy(async (event: ValidatedEvent) => {
  const { tenantId } = event.tenantContext;
  const query = event.validated.queryStringParameters;

  // TODO: Inject revenue report use case
  return toApiGatewayResponse({
    success: true,
    data: {
      tenantId,
      from: query.from,
      to: query.to,
      gameId: query.gameId ?? "all",
      groupBy: query.groupBy ?? "day",
      items: [],
      totals: {
        totalBets: 0,
        totalWins: 0,
        grossRevenue: 0,
        currency: "VND",
      },
    },
  });
})
  .use(tenantAuth())
  .use(validatorZodMiddleware({ queryStringParameters: querySchema }))
  .use(httpErrorHandlerUseCaseFormat());
