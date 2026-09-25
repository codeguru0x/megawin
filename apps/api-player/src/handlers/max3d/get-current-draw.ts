/**
 * Lambda handler: GET /games/max3d/draws/current
 * Lấy kỳ quay hiện tại + kết quả gần nhất.
 */

import { withPlayerAuth } from "@megawin/auth";
import { GetCurrentDrawPlayerUseCase } from "@megawin/game-max3d-application/use-cases/player";

import { POLLING_RATE_LIMIT } from "#lib/rate-limit";

const useCase = new GetCurrentDrawPlayerUseCase();

export const handler = withPlayerAuth(
  async () => {
    return useCase.run();
  },
  { rateLimit: { route: "max3d.current-draw", ...POLLING_RATE_LIMIT } },
);
