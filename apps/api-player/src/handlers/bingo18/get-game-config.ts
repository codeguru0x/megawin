/**
 * Lambda handler: GET /games/bingo18/config
 */

import { withPlayerAuth } from "@megawin/auth";
import { GetGameConfigPlayerUseCase } from "@megawin/game-bingo18-application/use-cases/player";

const useCase = new GetGameConfigPlayerUseCase();

export const handler = withPlayerAuth(async (event) => {
  const { tenantId } = event.user;
  return useCase.run({ tenantId });
});
