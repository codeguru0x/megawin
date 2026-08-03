import { KenoCollections } from "@megawin/game-keno/entities";
import { GameConfigScope } from "@megawin/game-core/entities";
import type {
  FinancialRates,
  BasicPrizes,
  BigSmallPrizes,
  EvenOddPrizes,
  PayoutCaps,
  PlayRules,
  OpsConfig,
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
   * Upsert global config. Filter `{ scope: Global }` là equality clause thuần
   * → Mongo tự điền `scope` vào doc mới khi insert (không cần lặp lại trong
   * `$setOnInsert`). $setOnInsert chỉ cần các field KHÔNG có trong filter
   * (`tenantId`, `createdAt`) — immutable, chỉ đặt lần đầu. $set cho mutable
   * fields. Increments version on each update.
   */
  async upsertGlobalConfig(
    config: Partial<{
      rates: FinancialRates;
      basicPrizes: BasicPrizes;
      bigSmallPrizes: BigSmallPrizes;
      evenOddPrizes: EvenOddPrizes;
      payoutCaps: PayoutCaps;
      play: PlayRules;
      ops: OpsConfig;
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
