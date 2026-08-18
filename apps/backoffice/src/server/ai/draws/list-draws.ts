/**
 * Use Case: List Draws (app-level, gộp 7 game — p1-03 §2.3)
 *
 * Điểm truy cập DUY NHẤT để tool `listDraws` liệt kê kỳ quay có filter — dispatch theo `GameProduct`
 * sang `ListDrawsUseCase` của game tương ứng. Cùng dispatcher domain với `getDrawDetail`
 * (`get-draw-snapshot.ts`) nhưng tách file riêng vì input/output khác hẳn (list có filter/pagination).
 *
 * `page`/`size` forward thẳng xuống use-case gốc — lotto535/power655 hỗ trợ thêm `cursor` nhưng
 * `page` (deprecated ở đó) vẫn hoạt động đúng, nên tool AI dùng chung 1 input shape cho cả 7 game.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { ListDrawsUseCase as Bingo18ListUseCase } from "@megawin/game-bingo18-application/use-cases/draws";
import { GameProduct } from "@megawin/game-core/entities";
import { GAME_LABELS } from "@megawin/game-core/labels";
import { ListDrawsUseCase as KenoListUseCase } from "@megawin/game-keno-application/use-cases/draws";
import { ListDrawsUseCase as Lotto535ListUseCase } from "@megawin/game-lotto535-application/use-cases/draws";
import { ListDrawsUseCase as Max3dListUseCase } from "@megawin/game-max3d-application/use-cases/draws";
import { ListDrawsUseCase as Max3dproListUseCase } from "@megawin/game-max3dpro-application/use-cases/draws";
import { ListDrawsUseCase as Mega645ListUseCase } from "@megawin/game-mega645-application/use-cases/draws";
import { ListDrawsUseCase as Power655ListUseCase } from "@megawin/game-power655-application/use-cases/draws";
import { AppException } from "@megawin/shared/errors";

import type { ListDrawsDispatchInput, ListDrawsDispatchOutput } from "./types";

const listUseCases = {
  [GameProduct.Keno]: new KenoListUseCase(),
  [GameProduct.Lotto535]: new Lotto535ListUseCase(),
  [GameProduct.Mega645]: new Mega645ListUseCase(),
  [GameProduct.Power655]: new Power655ListUseCase(),
  [GameProduct.Max3d]: new Max3dListUseCase(),
  [GameProduct.Max3dpro]: new Max3dproListUseCase(),
  [GameProduct.Bingo18]: new Bingo18ListUseCase(),
};

/** Bắt compiler khi `GameProduct` thêm entry mới mà `listUseCases` chưa có. */
function assertKnownGame(game: GameProduct): asserts game is keyof typeof listUseCases {
  if (!(game in listUseCases)) {
    throw AppException.internal(`Game không được hỗ trợ: ${String(game)}`);
  }
}

export class ListDrawsDispatchUseCase extends UseCase<ListDrawsDispatchInput, ListDrawsDispatchOutput> {
  protected async execute(input: ListDrawsDispatchInput): Promise<ListDrawsDispatchOutput> {
    const { game, ...filters } = input;
    assertKnownGame(game);

    const result = await listUseCases[game].run(filters);

    return {
      meta: { game, gameLabel: GAME_LABELS[game], fetchedAt: new Date().toISOString() },
      result,
    };
  }
}
