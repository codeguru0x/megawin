import { GameConfigScope } from "@megawin/game-core/entities";
import type { TenantConfigDoc, TenantConfigEntity } from "@megawin/game-lotto535/entities";
import { Lotto535Collections } from "@megawin/game-lotto535/entities";
import { nowVN } from "@megawin/shared/utils";

import { TenantConfigMapper } from "../mappers/tenant-config-mapper";
import { BaseRepo } from "./base-repo";

export class TenantConfigRepository extends BaseRepo<TenantConfigEntity, TenantConfigMapper> {
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
    fields: Partial<Pick<TenantConfigDoc, "commissionRate" | "isEnabled">>,
  ): Promise<TenantConfigEntity | null> {
    const now = nowVN();
    const $set: Record<string, unknown> = { updatedAt: now };

    if (fields.commissionRate !== undefined) $set.commissionRate = fields.commissionRate;
    if (fields.isEnabled !== undefined) $set.isEnabled = fields.isEnabled;

    const $setOnInsert: Record<string, unknown> = {
      scope: GameConfigScope.Tenant,
      tenantId,
      createdAt: now,
    };

    if (fields.commissionRate === undefined) $setOnInsert.commissionRate = 0;
    if (fields.isEnabled === undefined) $setOnInsert.isEnabled = true;

    return await this.findOneAndUpdate(
      { scope: GameConfigScope.Tenant, tenantId },
      {
        $set,
        $inc: { version: 1 },
        $setOnInsert,
      },
      { upsert: true, returnDocument: "after" },
    );
  }

  async listTenantConfigs(): Promise<TenantConfigEntity[]> {
    return await this.findMany({ scope: GameConfigScope.Tenant }, { sort: { tenantId: 1 } });
  }
}
