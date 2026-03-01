import {
  Mega645Collections,
} from "@megawin/game-mega645/entities";
import { GameConfigScope } from "@megawin/game-core/entities";
import type {
  JackpotConfig,
  FinancialRates,
  PrizeAmounts,
  PlayRules,
} from "@megawin/game-mega645/entities";
import { BaseRepo } from "./base-repo";
import {
  GameConfigMapper,
  type GlobalConfigEntity,
} from "../mappers/global-config-mapper";

export class GameConfigRepository extends BaseRepo<
  GlobalConfigEntity,
  GameConfigMapper
> {
  constructor() {
    super({
      collName: Mega645Collections.GameConfigs,
      dataMapper: new GameConfigMapper(),
    });
  }

  async getGlobalConfig(): Promise<GlobalConfigEntity | null> {
    return await this.findOne({
      scope: GameConfigScope.Global,
    });
  }

  /**
   * Upsert global config. Uses $setOnInsert for immutable fields,
   * $set for mutable fields. Increments version on each update.
   */
  async upsertGlobalConfig(
    config: Partial<{
      jackpot: JackpotConfig;
      rates: FinancialRates;
      defaultPrizes: PrizeAmounts;
      play: PlayRules;
    }>,
  ): Promise<GlobalConfigEntity | null> {
    const now = new Date();
    const $set: Record<string, unknown> = { updatedAt: now };

    if (config.jackpot) $set.jackpot = config.jackpot;
    if (config.rates) $set.rates = config.rates;
    if (config.defaultPrizes) $set.defaultPrizes = config.defaultPrizes;
    if (config.play) $set.play = config.play;

    return await this.findOneAndUpdate(
      { scope: GameConfigScope.Global },
      {
        $set,
        $inc: { version: 1 },
        $setOnInsert: {
          scope: GameConfigScope.Global,
          tenantId: null,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  }
}
