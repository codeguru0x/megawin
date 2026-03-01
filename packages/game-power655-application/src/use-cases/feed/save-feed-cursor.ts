/**
 * Use Case: Save Feed Cursor (Power 6/55)
 *
 * Lưu version cuối cùng đã sync cho Power 6/55.
 */

import { GameProduct } from "@megawin/game-core/entities";
import { BaseSaveFeedCursorUseCase } from "@megawin/game-core-application/use-cases";

export class SaveFeedCursorUseCase extends BaseSaveFeedCursorUseCase {
  protected getGameProduct(): GameProduct {
    return GameProduct.Power655;
  }
}
