/**
 * Lambda handler: GET /games/power655/config
 */

import { withPlayerAuth } from "@megawin/auth";
import { GetGameConfigPlayerUseCase } from "@megawin/game-power655-application/use-cases/player";

import { READ_RATE_LIMIT } from "#lib/rate-limit";

const useCase = new GetGameConfigPlayerUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { tenantId } = event.user;
    return useCase.run({ tenantId });
  },
  { rateLimit: { route: "power655.config", ...READ_RATE_LIMIT } },
);
