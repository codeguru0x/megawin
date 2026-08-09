/**
 * Lambda handler: GET /player/mega645/jackpot
 * Lấy thông tin jackpot hiện tại cho player.
 */

import { withPlayerAuth } from "@megawin/auth";
import { GetJackpotPlayerUseCase } from "@megawin/game-mega645-application/use-cases/player";

const useCase = new GetJackpotPlayerUseCase();

export const handler = withPlayerAuth(async () => {
  return useCase.run(undefined as void);
});
