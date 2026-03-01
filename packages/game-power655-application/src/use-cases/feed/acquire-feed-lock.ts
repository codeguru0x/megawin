/**
 * Use Case: Acquire Feed Lock (Power 6/55)
 *
 * Đảm bảo chỉ 1 worker sync feed tại 1 thời điểm cho Power 6/55.
 */

import { GameProduct } from "@megawin/game-core/entities";
import { BaseAcquireFeedLockUseCase } from "@megawin/game-core-application/use-cases";

export class AcquireFeedLockUseCase extends BaseAcquireFeedLockUseCase {
  protected getGameProduct(): GameProduct {
    return GameProduct.Power655;
  }
}
