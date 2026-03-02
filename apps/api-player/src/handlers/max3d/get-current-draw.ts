/**
 * Lambda handler: GET /games/max3d/draws/current
 * Lấy kỳ quay hiện tại + kết quả gần nhất.
 */

import { withPlayerAuth } from "@megawin/auth";

import { GetCurrentDrawPlayerUseCase } from "@megawin/game-max3d-application/use-cases/player";

const useCase = new GetCurrentDrawPlayerUseCase();

export const handler = withPlayerAuth(async () => {
  return useCase.run(undefined as void);
});
