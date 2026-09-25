/**
 * Lambda handler: GET /player/lotto535/jackpot
 * Lấy thông tin jackpot hiện tại cho player.
 */

import { withPlayerAuth } from "@megawin/auth";
import { GetJackpotPlayerUseCase } from "@megawin/game-lotto535-application/use-cases/player";

import { POLLING_RATE_LIMIT } from "#lib/rate-limit";

const useCase = new GetJackpotPlayerUseCase();

export const handler = withPlayerAuth(
  async () => {
    return useCase.run();
  },
  { rateLimit: { route: "lotto535.jackpot", ...POLLING_RATE_LIMIT } },
);
