/**
 * Lambda handler: GET /player/games/{gameId}/results/{roundId}
 * Xem kết quả game round — authed qua Cognito JWT.
 */

import { z } from "zod";

import { withPlayerAuth } from "@megawin/auth";
import { toApiGatewayResponse } from "@megawin/app-core/use-cases";

// ============ Zod schema ============

const VALID_GAME_IDS = ["keno", "lotto535"] as const;

const pathSchema = z.object({
  gameId: z.enum(VALID_GAME_IDS),
  roundId: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}\.\d{3}$/, "Format: YYYY-MM-DD.NNN"),
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
  { schemas: { path: pathSchema } }
);
