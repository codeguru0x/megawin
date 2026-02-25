/**
 * Lambda handler: GET /player/bets
 * Lịch sử đặt cược của player — authed qua Cognito JWT.
 */

import { z } from "zod";

import { withPlayerAuth } from "@megawin/auth";
import { toApiGatewayResponse } from "@megawin/app-core/use-cases";

// ============ Zod schema ============

const querySchema = z.object({
  gameId: z.string().optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
});

// ============ Handler ============

export const handler = withPlayerAuth(
  async (event) => {
    const { accountId, sub, tenantId } = event.user;
    const query = event.schema.query;

    // TODO: Inject bet history use case
    return toApiGatewayResponse({
      success: true,
      data: {
        playerId: accountId ?? sub,
        tenantId,
        bets: [],
        filters: query,
      },
    });
  },
  { schemas: { query: querySchema } },
);
