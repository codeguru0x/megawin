/**
 * Lambda handler: GET /games/keno/config
 * Lấy cấu hình game Keno cho player — luật chơi, bảng giải thưởng, trạng thái tenant.
 */

import { withPlayerAuth } from "@megawin/auth";
import { GetGameConfigPlayerUseCase } from "@megawin/game-keno-application/use-cases/player";

import { READ_RATE_LIMIT } from "#lib/rate-limit";

const useCase = new GetGameConfigPlayerUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { tenantId } = event.user;
    return useCase.run({ tenantId });
  },
  { rateLimit: { route: "keno.config", ...READ_RATE_LIMIT } },
);
