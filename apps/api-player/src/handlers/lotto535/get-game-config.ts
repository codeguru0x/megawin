/**
 * Lambda handler: GET /games/lotto535/config
 * Lấy cấu hình game Lotto 5/35 cho player — luật chơi, bảng giải thưởng, jackpot, trạng thái tenant.
 */

import { withPlayerAuth } from "@megawin/auth";
import { GetGameConfigPlayerUseCase } from "@megawin/game-lotto535-application/use-cases/player";

import { READ_RATE_LIMIT } from "#lib/rate-limit";

const useCase = new GetGameConfigPlayerUseCase();

export const handler = withPlayerAuth(
  async (event) => {
    const { tenantId } = event.user;
    return useCase.run({ tenantId });
  },
  { rateLimit: { route: "lotto535.config", ...READ_RATE_LIMIT } },
);
