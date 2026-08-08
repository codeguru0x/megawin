/**
 * Lambda handler: GET /player/power655/draws/current
 *
 * Lấy kỳ quay hiện tại + dual jackpot (JP1 + JP2) + kết quả gần nhất.
 * Power 6/55 khác Lotto 5/35: trả cả jackpot1 và jackpot2.
 */

import { withPlayerAuth } from "@megawin/auth";
import { GetCurrentDrawPlayerUseCase } from "@megawin/game-power655-application/use-cases/player";

const useCase = new GetCurrentDrawPlayerUseCase();

export const handler = withPlayerAuth(async () => {
  return useCase.run(undefined as void);
});
