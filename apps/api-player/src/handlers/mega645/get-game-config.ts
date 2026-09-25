/**
 * Lambda handler: GET /games/mega645/config
 */

import { withPlayerAuth } from "@megawin/auth";
import { GetGameConfigPlayerUseCase } from "@megawin/game-mega645-application/use-cases/player";

import { READ_RATE_LIMIT } from "#lib/rate-limit";

const useCase = new GetGameConfigPlayerUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { tenantId } = event.user;
    return useCase.run({ tenantId });
  },
  { rateLimit: { route: "mega645.config", ...READ_RATE_LIMIT } },
);
