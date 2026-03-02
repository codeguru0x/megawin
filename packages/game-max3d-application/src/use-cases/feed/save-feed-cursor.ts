import { GameProduct } from "@megawin/game-core/entities";
import { BaseSaveFeedCursorUseCase } from "@megawin/game-core-application/use-cases";

export class SaveFeedCursorUseCase extends BaseSaveFeedCursorUseCase {
  protected getGameProduct(): GameProduct {
    return GameProduct.Max3d;
  }
}
