/**
 * Use Case: Get Ops Alerts (app-level, gộp 7 game — p1-03 §2.5)
 *
 * Điểm truy cập DUY NHẤT để tool `getOpsAlerts` đọc alert vận hành 1 kỳ — dispatch theo
 * `GameProduct` sang `ListAlertsUseCase` của game tương ứng. Luôn gọi `grouped: true` (đúng
 * default use-case, badge panel style) — tool này chỉ ĐỌC, không ack được (đúng nguyên tắc
 * read-only p1-03 §1.1 mục 1).
 *
 * Cùng dispatch pattern object-map + `assertKnownGame` với `get-ops-snapshot.ts`.
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { ListAlertsUseCase as Bingo18AlertsUseCase } from "@megawin/game-bingo18-application/use-cases/operations";
import { GameProduct } from "@megawin/game-core/entities";
import { GAME_LABELS } from "@megawin/game-core/labels";
import { OpsAlertStatus } from "@megawin/game-core/types";
import { ListAlertsUseCase as KenoAlertsUseCase } from "@megawin/game-keno-application/use-cases/operations";
import { ListAlertsUseCase as Lotto535AlertsUseCase } from "@megawin/game-lotto535-application/use-cases/operations";
import { ListAlertsUseCase as Max3dAlertsUseCase } from "@megawin/game-max3d-application/use-cases/operations";
import { ListAlertsUseCase as Max3dproAlertsUseCase } from "@megawin/game-max3dpro-application/use-cases/operations";
import { ListAlertsUseCase as Mega645AlertsUseCase } from "@megawin/game-mega645-application/use-cases/operations";
import { ListAlertsUseCase as Power655AlertsUseCase } from "@megawin/game-power655-application/use-cases/operations";
import { AppException } from "@megawin/shared/errors";

import type { GetOpsAlertsDispatchInput, GetOpsAlertsDispatchOutput } from "./types";

const alertUseCases = {
  [GameProduct.Keno]: new KenoAlertsUseCase(),
  [GameProduct.Lotto535]: new Lotto535AlertsUseCase(),
  [GameProduct.Mega645]: new Mega645AlertsUseCase(),
  [GameProduct.Power655]: new Power655AlertsUseCase(),
  [GameProduct.Max3d]: new Max3dAlertsUseCase(),
  [GameProduct.Max3dpro]: new Max3dproAlertsUseCase(),
  [GameProduct.Bingo18]: new Bingo18AlertsUseCase(),
};

/** Bắt compiler khi `GameProduct` thêm entry mới mà `alertUseCases` chưa có. */
function assertKnownGame(game: GameProduct): asserts game is keyof typeof alertUseCases {
  if (!(game in alertUseCases)) {
    throw AppException.internal(`Game không được hỗ trợ: ${String(game)}`);
  }
}

export class GetOpsAlertsDispatchUseCase extends UseCase<GetOpsAlertsDispatchInput, GetOpsAlertsDispatchOutput> {
  protected async execute(input: GetOpsAlertsDispatchInput): Promise<GetOpsAlertsDispatchOutput> {
    const { game, drawId, status = OpsAlertStatus.New } = input;
    assertKnownGame(game);

    const result = await alertUseCases[game].run({ drawId, status, grouped: true });

    return {
      meta: { game, gameLabel: GAME_LABELS[game], drawId, fetchedAt: new Date().toISOString() },
      result,
    };
  }
}
