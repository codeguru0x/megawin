/**
 * Lambda handler: GET /games/mega645/config
 */

import { withPlayerAuth } from "@megawin/auth";
import { GetGameConfigPlayerUseCase } from "@megawin/game-mega645-application/use-cases/player";

const useCase = new GetGameConfigPlayerUseCase();

export const handler = withPlayerAuth(async (event) => {
  const { tenantId } = event.user;
  return useCase.run({ tenantId });
});
