import { GameConfigScope } from "@megawin/game-core/entities";
import type { BaseEntity } from "@megawin/data/mongo";
import type { MongoMapper } from "@megawin/data/mongo";
import type { Document } from "mongodb";
import { BaseRepo } from "./base-repo";

export abstract class AbstractGameConfigRepository<
  TEntity extends BaseEntity,
  TMapper extends MongoMapper<Document, TEntity>,
  TPrizeConfig,
  TPlayRules,
  TFinancialRates,
> extends BaseRepo<TEntity, TMapper> {
  async getGlobalConfig(): Promise<TEntity | null> {
    return await this.findOne({
      scope: GameConfigScope.Global,
    });
  }

  async upsertGlobalConfig(
    config: Partial<{
      rates: TFinancialRates;
      defaultPrizes: TPrizeConfig;
      play: TPlayRules;
    }>
  ): Promise<TEntity | null> {
    const now = new Date();
    const $set: Record<string, unknown> = { updatedAt: now };

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
      { upsert: true, returnDocument: "after" }
    );
  }
}
