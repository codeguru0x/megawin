import { GameProduct } from "@megawin/game-core/entities";
import { BaseReadFeedCursorUseCase } from "@megawin/game-core-application/use-cases";

export class ReadFeedCursorUseCase extends BaseReadFeedCursorUseCase {
  protected getGameProduct(): GameProduct {
    return GameProduct.Keno;
  }
}
