import { Max3dproCollections } from "@megawin/game-max3dpro/entities";
import type {
  FinancialRates,
  Max3dproPrizeConfig,
  PlayRules,
} from "@megawin/game-max3dpro/entities";
import { AbstractGameConfigRepository } from "@megawin/game-max3d-core/repos";
import { GameConfigMapper } from "../mappers/global-config-mapper";
import type { GlobalConfigEntity } from "@megawin/game-max3dpro/entities";

export class GameConfigRepository extends AbstractGameConfigRepository<
  GlobalConfigEntity,
  GameConfigMapper,
  Max3dproPrizeConfig,
  PlayRules,
  FinancialRates
> {
  constructor() {
    super({
      collName: Max3dproCollections.GameConfigs,
      dataMapper: new GameConfigMapper(),
    });
  }
}

export type { GlobalConfigEntity };
