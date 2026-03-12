/**
 * Lambda handler: GET /player/power655/jackpot
 *
 * Lấy thông tin dual jackpot Power 6/55 cho player.
 * Trả JP1 (6/6 số chính) + JP2 (5/6 + bonus) + progress tổng hợp.
 */

import { withPlayerAuth } from "@megawin/auth";

import { GetJackpotPlayerUseCase } from "@megawin/game-power655-application/use-cases/player";

const useCase = new GetJackpotPlayerUseCase();

export const handler = withPlayerAuth(async () => {
  return useCase.run();
});
