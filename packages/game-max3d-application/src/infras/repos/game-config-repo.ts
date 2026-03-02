import { Max3dCollections } from "@megawin/game-max3d/entities";
import type {
  FinancialRates,
  Max3dPrizeConfig,
  PlayRules,
} from "@megawin/game-max3d/entities";
import { AbstractGameConfigRepository } from "@megawin/game-max3d-core/repos";
import {
  GameConfigMapper,
  type GlobalConfigEntity,
} from "../mappers/global-config-mapper";

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
