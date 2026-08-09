import { GameConfigScope } from "@megawin/game-core/entities";
import type {
  FinancialRates,
  GlobalConfigEntity,
  Max3dproPrizeConfig,
  OpsConfig,
  PlayRules,
} from "@megawin/game-max3dpro/entities";
import { Max3dproCollections } from "@megawin/game-max3dpro/entities";

import { GameConfigMapper } from "../mappers/global-config-mapper";
import { BaseRepo } from "./base-repo";

/**
 * Repository quản lý cấu hình game toàn cục — Max 3D Pro.
 *
 * Lưu trữ: prize amounts, financial rates (companyRate), play rules.
 * Chỉ có 1 document scope=Global trong collection.
 */
export class GameConfigRepository extends BaseRepo<GlobalConfigEntity, GameConfigMapper> {
  constructor() {
    super({
      collName: Max3dproCollections.GameConfigs,
      dataMapper: new GameConfigMapper(),
    });
  }

  /** Lấy global config. Trả về null nếu chưa setup. */
  async getGlobalConfig(): Promise<GlobalConfigEntity | null> {
    return await this.findOne({
      scope: GameConfigScope.Global,
    });
  }

  /**
   * Upsert global config — chỉ update các fields được truyền vào.
   *
   * Filter `{ scope: Global }` là equality clause thuần → Mongo tự điền `scope`
   * vào doc mới khi insert (không cần lặp lại trong `$setOnInsert`).
   * `$inc: { version: 1 }` để optimistic concurrency.
   */
  async upsertGlobalConfig(
    config: Partial<{
      rates: FinancialRates;
      defaultPrizes: Max3dproPrizeConfig;
      play: PlayRules;
      ops: OpsConfig;
    }>,
  ): Promise<GlobalConfigEntity | null> {
    const now = new Date();
    const $set: Record<string, unknown> = { updatedAt: now };

    if (config.rates) $set.rates = config.rates;
    if (config.defaultPrizes) $set.defaultPrizes = config.defaultPrizes;
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
      {
        upsert: true,
        returnDocument: "after",
      },
    );
  }
}

export type { GlobalConfigEntity };
