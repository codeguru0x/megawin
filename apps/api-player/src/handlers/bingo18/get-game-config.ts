/**
 * Lambda handler: GET /games/bingo18/config
 */

import { withPlayerAuth } from "@megawin/auth";
import { GetGameConfigPlayerUseCase } from "@megawin/game-bingo18-application/use-cases/player";

import { READ_RATE_LIMIT } from "#lib/rate-limit";

const useCase = new GetGameConfigPlayerUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { tenantId } = event.user;
    return useCase.run({ tenantId });
  },
  { rateLimit: { route: "bingo18.config", ...READ_RATE_LIMIT } },
);
