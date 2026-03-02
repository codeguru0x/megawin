import { GameProduct } from "@megawin/game-core/entities";
import { BaseAcquireFeedLockUseCase } from "@megawin/game-core-application/use-cases";

export class AcquireFeedLockUseCase extends BaseAcquireFeedLockUseCase {
  protected getGameProduct(): GameProduct {
    return GameProduct.Max3dpro;
  }
}
