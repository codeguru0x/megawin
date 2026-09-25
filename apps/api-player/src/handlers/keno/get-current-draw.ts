/**
 * Lambda handler: GET /player/keno/draws/current
 * Lấy kỳ quay Keno hiện tại + kết quả gần nhất.
 */

import { withPlayerAuth } from "@megawin/auth";
import { GetCurrentDrawPlayerUseCase } from "@megawin/game-keno-application/use-cases/player";

import { POLLING_RATE_LIMIT } from "#lib/rate-limit";

const useCase = new GetCurrentDrawPlayerUseCase();

export const handler = withPlayerAuth(
  async () => {
    return useCase.run();
  },
  { rateLimit: { route: "keno.current-draw", ...POLLING_RATE_LIMIT } },
);
