import { GameConfigScope } from "@megawin/game-core/entities";
import type { BaseEntity } from "@megawin/data/mongo";
import type { MongoMapper } from "@megawin/data/mongo";
import type { Document } from "mongodb";
import { BaseRepo } from "./base-repo";
import { nowVN } from "@megawin/shared/utils/date";

export interface TenantConfigFields {
  commissionRate?: number;
  isEnabled?: boolean;
}

export abstract class AbstractTenantConfigRepository<
  TEntity extends BaseEntity,
  TMapper extends MongoMapper<Document, TEntity>,
> extends BaseRepo<TEntity, TMapper> {
  async getTenantConfig(tenantId: string): Promise<TEntity | null> {
    return await this.findOne({
      scope: GameConfigScope.Tenant,
      tenantId,
    });
  }

  async upsertTenantConfig(
    tenantId: string,
    fields: TenantConfigFields
  ): Promise<TEntity | null> {
    const now = nowVN();
    const $set: Record<string, unknown> = { updatedAt: now };

    if (fields.commissionRate !== undefined)
      $set.commissionRate = fields.commissionRate;
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
      { upsert: true, returnDocument: "after" }
    );
  }

  async listTenantConfigs(): Promise<TEntity[]> {
    return await this.findMany(
      { scope: GameConfigScope.Tenant },
      { sort: { tenantId: 1 } }
    );
  }
}
