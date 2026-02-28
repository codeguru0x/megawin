/**
 * Lambda handler: GET /player/lotto535/draws/current
 * Lấy kỳ quay hiện tại + jackpot + kết quả gần nhất.
 */

import { withPlayerAuth } from "@megawin/auth";

import { GetCurrentDrawPlayerUseCase } from "@megawin/game-lotto535-application/use-cases/player";

const useCase = new GetCurrentDrawPlayerUseCase();

export const handler = withPlayerAuth(async () => {
  return useCase.run(undefined as void);
});
