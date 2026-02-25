import {
  Lotto535Collections,
} from "@megawin/game-lotto535/entities";
import { GameConfigScope } from "@megawin/game-core/entities";
import type { TenantConfigDoc } from "@megawin/game-lotto535/entities";
import { BaseRepo } from "./base-repo";
import {
  TenantConfigMapper,
  type TenantConfigEntity,
} from "../mappers/tenant-config-mapper";

export class TenantConfigRepository extends BaseRepo<
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
      scope: GameConfigScope.Tenant,
      tenantId,
    });
  }

  async upsertTenantConfig(
    tenantId: string,
    fields: Partial<
      Pick<TenantConfigDoc, "commissionRate" | "isEnabled" | "prizeOverrides">
    >,
  ): Promise<TenantConfigEntity | null> {
    const now = new Date();
    const $set: Record<string, unknown> = { updatedAt: now };

    if (fields.commissionRate !== undefined) $set.commissionRate = fields.commissionRate;
    if (fields.isEnabled !== undefined) $set.isEnabled = fields.isEnabled;
    if (fields.prizeOverrides !== undefined) $set.prizeOverrides = fields.prizeOverrides;

    return await this.findOneAndUpdate(
      { scope: GameConfigScope.Tenant, tenantId },
      {
        $set,
        $inc: { version: 1 },
        $setOnInsert: {
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
      { scope: GameConfigScope.Tenant },
      { sort: { tenantId: 1 } },
    );
  }
}
