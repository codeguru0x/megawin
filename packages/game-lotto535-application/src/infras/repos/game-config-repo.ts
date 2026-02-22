import {
  Lotto535Collections,
  GameConfigScope,
  Lotto535Product,
} from "@megawin/game-lotto535/entities";
import type { Lotto535GlobalConfigDoc, Lotto535TenantConfigDoc } from "@megawin/game-lotto535/entities";
import { Lotto535BaseRepo } from "./lotto535-base-repo";
import {
  GameConfigMapper,
  TenantConfigMapper,
  type GlobalConfigEntity,
  type TenantConfigEntity,
} from "../mappers/game-config-mapper";

export class GameConfigRepository extends Lotto535BaseRepo<
  GlobalConfigEntity,
  GameConfigMapper
> {
  constructor() {
    super({
      collName: Lotto535Collections.GameConfigs,
      dataMapper: new GameConfigMapper(),
    });
  }

  async getGlobalConfig(): Promise<GlobalConfigEntity | null> {
    return await this.findOne({
      product: Lotto535Product,
      scope: GameConfigScope.Global,
    });
  }

  /**
   * Upsert global config. Uses $setOnInsert for immutable fields,
   * $set for mutable fields. Increments version on each update.
   */
  async upsertGlobalConfig(
    config: Partial<
      Pick<Lotto535GlobalConfigDoc, "jackpot" | "rates" | "defaultPrizes" | "play">
    >,
  ): Promise<GlobalConfigEntity | null> {
    const now = new Date();
    const $set: Record<string, unknown> = { updatedAt: now };

    if (config.jackpot) $set.jackpot = config.jackpot;
    if (config.rates) $set.rates = config.rates;
    if (config.defaultPrizes) $set.defaultPrizes = config.defaultPrizes;
    if (config.play) $set.play = config.play;

    return await this.findOneAndUpdate(
      { product: Lotto535Product, scope: GameConfigScope.Global },
      {
        $set,
        $inc: { version: 1 },
        $setOnInsert: {
          product: Lotto535Product,
          scope: GameConfigScope.Global,
          tenantId: null,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  }
}

export class TenantConfigRepository extends Lotto535BaseRepo<
  TenantConfigEntity,
  TenantConfigMapper
> {
  constructor() {
    super({
      collName: Lotto535Collections.GameConfigs,
      dataMapper: new TenantConfigMapper(),
    });
  }

  async getTenantConfig(tenantId: string): Promise<TenantConfigEntity | null> {
    return await this.findOne({
      product: Lotto535Product,
      scope: GameConfigScope.Tenant,
      tenantId,
    });
  }

  async upsertTenantConfig(
    tenantId: string,
    fields: Partial<
      Pick<Lotto535TenantConfigDoc, "commissionRate" | "isEnabled" | "prizeOverrides">
    >,
  ): Promise<TenantConfigEntity | null> {
    const now = new Date();
    const $set: Record<string, unknown> = { updatedAt: now };

    if (fields.commissionRate !== undefined) $set.commissionRate = fields.commissionRate;
    if (fields.isEnabled !== undefined) $set.isEnabled = fields.isEnabled;
    if (fields.prizeOverrides !== undefined) $set.prizeOverrides = fields.prizeOverrides;

    return await this.findOneAndUpdate(
      { product: Lotto535Product, scope: GameConfigScope.Tenant, tenantId },
      {
        $set,
        $inc: { version: 1 },
        $setOnInsert: {
          product: Lotto535Product,
          scope: GameConfigScope.Tenant,
          tenantId,
          commissionRate: fields.commissionRate ?? 0.2,
          isEnabled: fields.isEnabled ?? true,
          prizeOverrides: fields.prizeOverrides ?? null,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  }

  async listTenantConfigs(): Promise<TenantConfigEntity[]> {
    return await this.findMany(
      { product: Lotto535Product, scope: GameConfigScope.Tenant },
      { sort: { tenantId: 1 } },
    );
  }
}
