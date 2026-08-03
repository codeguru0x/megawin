import { Bingo18Collections } from "@megawin/game-bingo18/entities";
import { GameConfigScope } from "@megawin/game-core/entities";
import type { TenantConfigDoc } from "@megawin/game-bingo18/entities";
import { BaseRepo } from "./base-repo";
import { TenantConfigMapper } from "../mappers/game-config-mapper";
import type { TenantConfigEntity } from "@megawin/game-bingo18/entities";

export class TenantConfigRepository extends BaseRepo<TenantConfigEntity, TenantConfigMapper> {
  constructor() {
    super({
      collName: Bingo18Collections.GameConfigs,
      dataMapper: new TenantConfigMapper(),
    });
  }

  async getTenantConfig(tenantId: string): Promise<TenantConfigEntity | null> {
    return await this.findOne({
      scope: GameConfigScope.Tenant,
      tenantId,
    });
  }

  /**
   * Upsert tenant config — chỉ update các fields được truyền vào.
   *
   * Filter `{ scope: Tenant, tenantId }` là equality clause thuần → Mongo tự
   * điền cả 2 field vào doc mới khi insert (không cần lặp lại trong
   * `$setOnInsert`). `$setOnInsert` chỉ cần `createdAt` + default value cho
   * field chưa truyền vào.
   */
  async upsertTenantConfig(
    tenantId: string,
    fields: Partial<Pick<TenantConfigDoc, "commissionRate" | "isEnabled">>,
  ): Promise<TenantConfigEntity | null> {
    const now = new Date();
    const $set: Record<string, unknown> = { updatedAt: now };

    if (fields.commissionRate !== undefined) {
      $set.commissionRate = fields.commissionRate;
    }
    if (fields.isEnabled !== undefined) {
      $set.isEnabled = fields.isEnabled;
    }

    const $setOnInsert: Record<string, unknown> = { createdAt: now };

    if (fields.commissionRate === undefined) {
      $setOnInsert.commissionRate = 0.2;
    }
    if (fields.isEnabled === undefined) {
      $setOnInsert.isEnabled = true;
    }

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
