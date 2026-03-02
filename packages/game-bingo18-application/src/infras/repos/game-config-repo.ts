import { Bingo18Collections } from "@megawin/game-bingo18/entities";
import { GameConfigScope } from "@megawin/game-core/entities";
import type {
  FinancialRates,
  SingleNumPrizes,
  DoubleMatchPrizes,
  TripleMatchPrizes,
  SumTotalPrizes,
  BigSmallDrawPrizes,
  PlayRules,
} from "@megawin/game-bingo18/entities";
import { BaseRepo } from "./base-repo";
import {
  GameConfigMapper,
  type GlobalConfigEntity,
} from "../mappers/game-config-mapper";

export class GameConfigRepository extends BaseRepo<
  GlobalConfigEntity,
  GameConfigMapper
> {
  constructor() {
    super({
      collName: Bingo18Collections.GameConfigs,
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
      rates: FinancialRates;
      singleNumPrizes: SingleNumPrizes;
      doubleMatchPrizes: DoubleMatchPrizes;
      tripleMatchPrizes: TripleMatchPrizes;
      sumTotalPrizes: SumTotalPrizes;
      bigSmallDrawPrizes: BigSmallDrawPrizes;
      play: PlayRules;
    }>
  ): Promise<GlobalConfigEntity | null> {
    const now = new Date();
    const $set: Record<string, unknown> = { updatedAt: now };

    if (config.rates) $set.rates = config.rates;
    if (config.singleNumPrizes) $set.singleNumPrizes = config.singleNumPrizes;
    if (config.doubleMatchPrizes) $set.doubleMatchPrizes = config.doubleMatchPrizes;
    if (config.tripleMatchPrizes) $set.tripleMatchPrizes = config.tripleMatchPrizes;
    if (config.sumTotalPrizes) $set.sumTotalPrizes = config.sumTotalPrizes;
    if (config.bigSmallDrawPrizes) $set.bigSmallDrawPrizes = config.bigSmallDrawPrizes;
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
      { upsert: true, returnDocument: "after" }
    );
  }
}
