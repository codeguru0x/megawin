/**
 * Lambda handler: GET /player/bingo18/draws/current
 * Lấy kỳ quay Bingo 18 hiện tại + kết quả gần nhất.
 */

import { withPlayerAuth } from "@megawin/auth";

import { GetCurrentDrawPlayerUseCase } from "@megawin/game-bingo18-application/use-cases/player";

const useCase = new GetCurrentDrawPlayerUseCase();

export const handler = withPlayerAuth(async () => {
  return useCase.run();
});
