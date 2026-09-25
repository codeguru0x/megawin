/**
 * Lambda handler: GET /games/max3d/config
 */

import { withPlayerAuth } from "@megawin/auth";
import { GetGameConfigPlayerUseCase } from "@megawin/game-max3d-application/use-cases/player";

import { READ_RATE_LIMIT } from "#lib/rate-limit";

const useCase = new GetGameConfigPlayerUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { tenantId } = event.user;
    return useCase.run({ tenantId });
  },
  { rateLimit: { route: "max3d.config", ...READ_RATE_LIMIT } },
);
