import type {
  BigSmallDrawPrizes,
  DoubleMatchPrizes,
  FinancialRates,
  GlobalConfigEntity,
  OpsConfig,
  PlayRules,
  SingleNumPrizes,
  SumTotalPrizes,
  TripleMatchPrizes,
} from "@megawin/game-bingo18/entities";
import { Bingo18Collections } from "@megawin/game-bingo18/entities";
import { GameConfigScope } from "@megawin/game-core/entities";

import { GameConfigMapper } from "../mappers/game-config-mapper";
import { BaseRepo } from "./base-repo";

export class GameConfigRepository extends BaseRepo<GlobalConfigEntity, GameConfigMapper> {
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
   * Upsert global config. Filter `{ scope: Global }` là equality clause thuần
   * → Mongo tự điền `scope` vào doc mới khi insert (không cần lặp lại trong
   * `$setOnInsert`). $setOnInsert chỉ cần các field KHÔNG có trong filter
   * (`tenantId`, `createdAt`) — immutable, chỉ đặt lần đầu. $set cho mutable
   * fields. Increments version on each update.
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
      ops: OpsConfig;
    }>,
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
    if (config.ops) $set.ops = config.ops;

    return await this.findOneAndUpdate(
      { scope: GameConfigScope.Global },
      {
        $set,
        $inc: { version: 1 },
        $setOnInsert: {
          tenantId: null,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  }
}
