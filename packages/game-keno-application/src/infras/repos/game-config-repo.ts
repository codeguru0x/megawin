import { KenoCollections } from "@megawin/game-keno/entities";
import { GameConfigScope } from "@megawin/game-core/entities";
import type {
  FinancialRates,
  BasicPrizes,
  BigSmallPrizes,
  EvenOddPrizes,
  PayoutCaps,
  PlayRules,
} from "@megawin/game-keno/entities";
import { BaseRepo } from "./base-repo";
import { GameConfigMapper } from "../mappers/game-config-mapper";
import type { GlobalConfigEntity } from "@megawin/game-keno/entities";

export class GameConfigRepository extends BaseRepo<GlobalConfigEntity, GameConfigMapper> {
  constructor() {
    super({
      collName: KenoCollections.GameConfigs,
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
      basicPrizes: BasicPrizes;
      bigSmallPrizes: BigSmallPrizes;
      evenOddPrizes: EvenOddPrizes;
      payoutCaps: PayoutCaps;
      play: PlayRules;
    }>,
  ): Promise<GlobalConfigEntity | null> {
    const now = new Date();
    const $set: Record<string, unknown> = { updatedAt: now };

    if (config.rates) $set.rates = config.rates;
    if (config.basicPrizes) $set.basicPrizes = config.basicPrizes;
    if (config.bigSmallPrizes) $set.bigSmallPrizes = config.bigSmallPrizes;
    if (config.evenOddPrizes) $set.evenOddPrizes = config.evenOddPrizes;
    if (config.payoutCaps) $set.payoutCaps = config.payoutCaps;
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
