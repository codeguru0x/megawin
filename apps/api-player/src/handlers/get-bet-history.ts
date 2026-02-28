/**
 * Lambda handler: GET /player/bets
 * Lịch sử đặt cược của player — authed qua Cognito JWT.
 */

import { z } from "zod";

import { withPlayerAuth } from "@megawin/auth";
import { toApiGatewayResponse } from "@megawin/app-core/use-cases";

// ============ Zod schema ============

const VALID_GAME_IDS = ["keno", "lotto535"] as const;

const querySchema = z.object({
  gameId: z.enum(VALID_GAME_IDS).optional(),
  page: z
    .string()
    .default("1")
    .transform((v) => Math.max(1, parseInt(v, 10) || 1)),
  pageSize: z
    .string()
    .default("20")
    .transform((v) => Math.min(100, Math.max(1, parseInt(v, 10) || 20))),
});

// ============ Handler ============

export const handler = withPlayerAuth(
  async (event) => {
    const { accountId, tenantId } = event.user;
    const query = event.schema.query;

    // TODO: Inject bet history use case
    return toApiGatewayResponse({
      success: true,
      data: {
        accountId,
        tenantId,
        bets: [],
        filters: query,
      },
    });
  },
  { schemas: { query: querySchema } }
);
