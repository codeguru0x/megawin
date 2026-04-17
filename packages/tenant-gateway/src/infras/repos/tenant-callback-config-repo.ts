/**
 * Minimal repo chỉ đọc callback config (callbackBaseUrl, apiKey) từ identity DB.
 *
 * Tách riêng khỏi TenantRepository ở identity-application vì:
 * - tenant-gateway chỉ cần 3 fields, không cần full entity + mapper.
 * - Tránh circular dependency: tenant-gateway không depend identity-application.
 * - Query trực tiếp với projection tối thiểu → nhanh nhất có thể.
 *
 * @internal Không export ra ngoài package.
 */

import { MongoRepository, Constants } from "@megawin/data/mongo";
import type { TenantEntity } from "@megawin/identity/entities";

type TenantCallbackConfig = Pick<TenantEntity, "tenantId" | "callbackBaseUrl" | "apiKey">;

export class TenantCallbackConfigRepo extends MongoRepository<TenantEntity> {
  constructor() {
    super({
      collName: "tenants",
      dbName: Constants.Default.DbName,
    });
  }

  async getCallbackConfig(tenantId: string): Promise<TenantCallbackConfig | null> {
    return await this.findOne(
      { tenantId },
      { projection: { tenantId: 1, callbackBaseUrl: 1, apiKey: 1 } },
    );
  }
}
