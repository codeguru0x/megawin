/**
 * Lambda handler: GET /tenant/reports/revenue
 * Tenant xem báo cáo doanh thu.
 * Auth: API Key (server-to-server).
 */

import { z } from "zod";

import { withTenantAuth } from "@megawin/auth/tenant";
import { toApiGatewayResponse } from "@megawin/app-core/use-cases";

// ============ Zod schema ============

const querySchema = z.object({
  from: z.string().min(1, "from date required"),
  to: z.string().min(1, "to date required"),
  gameId: z.string().optional(),
  groupBy: z.enum(["day", "week", "month"]).optional(),
});

// ============ Handler ============

export const handler = withTenantAuth(
  async (event) => {
    const { tenantId } = event.tenant;
    const { from, to, gameId, groupBy } = event.schema.query;

    // TODO: Inject revenue report use case
    return toApiGatewayResponse({
      success: true,
      data: {
        tenantId,
        from,
        to,
        gameId: gameId ?? "all",
        groupBy: groupBy ?? "day",
        items: [],
        totals: {
          totalBets: 0,
          totalWins: 0,
          grossRevenue: 0,
          currency: "VND",
        },
      },
    });
  },
  { schemas: { query: querySchema } },
);
