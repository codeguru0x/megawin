/**
 * Lambda handler: GET /player/mega645/draws/current
 * Lấy kỳ quay hiện tại + jackpot + kết quả gần nhất.
 */

import { withPlayerAuth } from "@megawin/auth";

import { GetCurrentDrawPlayerUseCase } from "@megawin/game-mega645-application/use-cases/player";

const useCase = new GetCurrentDrawPlayerUseCase();

export const handler = withPlayerAuth(async () => {
  return useCase.run(undefined as void);
});
