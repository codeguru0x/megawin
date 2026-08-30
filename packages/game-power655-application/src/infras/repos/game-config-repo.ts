import { GameConfigScope } from "@megawin/game-core/entities";
import type {
  FinancialRates,
  GlobalConfigEntity,
  JackpotConfig,
  PlayRules,
  Power655OpsConfig,
  PrizeAmounts,
  VietlottPeriodAnchor,
} from "@megawin/game-power655/entities";
import { Power655Collections } from "@megawin/game-power655/entities";

import { GlobalConfigMapper } from "../mappers/global-config-mapper";
import { BaseRepo } from "./base-repo";

export class GameConfigRepository extends BaseRepo<GlobalConfigEntity, GlobalConfigMapper> {
  constructor() {
    super({
      collName: Power655Collections.GameConfigs,
      dataMapper: new GlobalConfigMapper(),
    });
  }

  async getGlobalConfig(): Promise<GlobalConfigEntity | null> {
    return await this.findOne({
      scope: GameConfigScope.Global,
    });
  }

  async upsertGlobalConfig(
    config: Partial<{
      jackpot: JackpotConfig;
      rates: FinancialRates;
      defaultPrizes: PrizeAmounts;
      play: PlayRules;
      ops: Power655OpsConfig;
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
