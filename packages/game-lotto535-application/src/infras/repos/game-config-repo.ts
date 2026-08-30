import { GameConfigScope } from "@megawin/game-core/entities";
import type {
  FinancialRates,
  GlobalConfigEntity,
  JackpotConfig,
  Lotto535OpsConfig,
  PlayRules,
  PrizeAmounts,
  VietlottPeriodAnchor,
} from "@megawin/game-lotto535/entities";
import { Lotto535Collections } from "@megawin/game-lotto535/entities";

import { GameConfigMapper } from "../mappers/global-config-mapper";
import { BaseRepo } from "./base-repo";

export class GameConfigRepository extends BaseRepo<GlobalConfigEntity, GameConfigMapper> {
  constructor() {
    super({
      collName: Lotto535Collections.GameConfigs,
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
      ops: Lotto535OpsConfig;
      vietlott: VietlottPeriodAnchor;
    }>,
  ): Promise<GlobalConfigEntity | null> {
    const now = new Date();
    const $set: Record<string, unknown> = { updatedAt: now };

    if (config.jackpot) $set.jackpot = config.jackpot;
    if (config.rates) $set.rates = config.rates;
    if (config.defaultPrizes) $set.defaultPrizes = config.defaultPrizes;
    if (config.play) $set.play = config.play;
    if (config.ops) $set.ops = config.ops;
    if (config.vietlott) $set.vietlott = config.vietlott;

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
