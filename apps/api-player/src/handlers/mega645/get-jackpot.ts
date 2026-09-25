/**
 * Lambda handler: GET /player/mega645/jackpot
 * Lấy thông tin jackpot hiện tại cho player.
 */

import { withPlayerAuth } from "@megawin/auth";
import { GetJackpotPlayerUseCase } from "@megawin/game-mega645-application/use-cases/player";

import { POLLING_RATE_LIMIT } from "#lib/rate-limit";

const useCase = new GetJackpotPlayerUseCase();

export const handler = withPlayerAuth(
  async () => {
    return useCase.run();
  },
  { rateLimit: { route: "mega645.jackpot", ...POLLING_RATE_LIMIT } },
);
