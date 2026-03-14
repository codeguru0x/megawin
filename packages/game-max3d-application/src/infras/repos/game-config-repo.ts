import { Max3dCollections } from "@megawin/game-max3d/entities";
import type {
  FinancialRates,
  Max3dPrizeConfig,
  PlayRules,
} from "@megawin/game-max3d/entities";
import { AbstractGameConfigRepository } from "@megawin/game-max3d-core/repos";
import { GameConfigMapper } from "../mappers/global-config-mapper";
import type { GlobalConfigEntity } from "@megawin/game-max3d/entities";

export class GameConfigRepository extends AbstractGameConfigRepository<
  GlobalConfigEntity,
  GameConfigMapper,
  Max3dPrizeConfig,
  PlayRules,
  FinancialRates
> {
  constructor() {
    super({
      collName: Max3dCollections.GameConfigs,
      dataMapper: new GameConfigMapper(),
    });
  }
}

export type { GlobalConfigEntity };
