import { MongoMapper } from "@megawin/data/mongo";
import type { SystemSettleTenantDailyEntity } from "@megawin/game-core/entities";
import type { Document } from "mongodb";

/**
 * Map MongoDB document (system_settle_tenant_daily) → SystemSettleTenantDailyEntity.
 *
 * Chuyển đổi `_id` (ObjectId) → `id` (hex string).
 * Tất cả field khác giữ nguyên kiểu — Date vẫn là Date, GameProduct vẫn là string.
 */
export class SystemSettleTenantDailyMapper extends MongoMapper<
  Document,
  SystemSettleTenantDailyEntity
> {
  protected mapProps(doc: Document): SystemSettleTenantDailyEntity {
    const { _id, ...rest } = doc as any;

    return {
      id: _id.toHexString(),
      ...rest,
    } as SystemSettleTenantDailyEntity;
  }
}
