import { GameConfigScope } from "@megawin/game-core/entities";
import type { TenantConfigEntity } from "@megawin/game-max3dpro/entities";
import { Max3dproCollections } from "@megawin/game-max3dpro/entities";
import { nowVN } from "@megawin/shared/utils";

import { TenantConfigMapper } from "../mappers/tenant-config-mapper";
import { BaseRepo } from "./base-repo";
import type { TenantConfigFields } from "./types/config.types";

/**
 * Repository quản lý cấu hình đại lý — Max 3D Pro.
 *
 * Mỗi tenant có 1 document scope=Tenant trong collection GameConfigs.
 * Lưu: commissionRate, isEnabled.
 */
export class TenantConfigRepository extends BaseRepo<TenantConfigEntity, TenantConfigMapper> {
  constructor() {
    super({
      collName: Max3dproCollections.GameConfigs,
      dataMapper: new TenantConfigMapper(),
    });
  }

  /** Lấy config của 1 tenant. Trả về null nếu chưa setup. */
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
   * `$setOnInsert`). Nếu create mới (insert): commissionRate default = 0,
   * isEnabled default = true.
   */
  async upsertTenantConfig(tenantId: string, fields: TenantConfigFields): Promise<TenantConfigEntity | null> {
    const now = nowVN();
    const $set: Record<string, unknown> = { updatedAt: now };

    if (fields.commissionRate !== undefined) $set.commissionRate = fields.commissionRate;
    if (fields.isEnabled !== undefined) $set.isEnabled = fields.isEnabled;

    const $setOnInsert: Record<string, unknown> = { createdAt: now };

    // Default values khi insert mới (fields chưa được truyền vào)
    if (fields.commissionRate === undefined) $setOnInsert.commissionRate = 0;
    if (fields.isEnabled === undefined) $setOnInsert.isEnabled = true;

    return await this.findOneAndUpdate(
      { scope: GameConfigScope.Tenant, tenantId },
      {
        $set,
        $inc: { version: 1 },
        $setOnInsert,
      },
      {
        upsert: true,
        returnDocument: "after",
      },
    );
  }

  /** Lấy tất cả tenant configs, sort by tenantId asc. */
  async listTenantConfigs(): Promise<TenantConfigEntity[]> {
    return await this.findMany({ scope: GameConfigScope.Tenant }, { sort: { tenantId: 1 } });
  }
}

export type { TenantConfigEntity };
