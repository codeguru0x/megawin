/**
 * Lambda handler: GET /player/games/{gameId}/results/{roundId}
 * Xem kết quả game round — authed qua Cognito JWT.
 */

import { z } from "zod";

import { withPlayerAuth } from "@megawin/auth";
import { toApiGatewayResponse } from "@megawin/app-core/use-cases";

// ============ Zod schema ============

const pathSchema = z.object({
  gameId: z.string().min(1),
  roundId: z.string().min(1),
});

// ============ Handler ============

export const handler = withPlayerAuth(
  async (event) => {
    const { gameId, roundId } = event.schema.path;

    // TODO: Inject game result use case
    return toApiGatewayResponse({
      success: true,
      data: {
        gameId,
        roundId,
        result: null,
        status: "pending",
      },
    });
  },
  { schemas: { path: pathSchema } },
);
