import { ListAllJackpotCycleOptionsUseCase } from "@megawin/game-mega645-application/use-cases/jackpot";

import { withApi } from "@/lib/api";

const useCase = new ListAllJackpotCycleOptionsUseCase();

/** GET /api/mega645/jackpot/cycle-options — danh sách cycles cho selector dropdown. */
export const GET = withApi()
  .auth()
  .handler(async () => useCase.run({}));
