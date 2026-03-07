/**
 * Lambda handler: GET /games/max3dpro/config
 */

import { withPlayerAuth } from "@megawin/auth";
import { GetGameConfigPlayerUseCase } from "@megawin/game-max3dpro-application/use-cases/player";

const useCase = new GetGameConfigPlayerUseCase();

export const handler = withPlayerAuth(async (event) => {
  const { tenantId } = event.user;
  return useCase.run({ tenantId });
});
