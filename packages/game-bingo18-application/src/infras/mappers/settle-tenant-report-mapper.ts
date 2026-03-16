import { MongoMapper } from "@megawin/data/mongo";
import type { SettleTenantReportEntity } from "@megawin/game-bingo18/entities";
import type { Document } from "mongodb";

/**
 * Map MongoDB document (bingo18_settle_tenant_reports) → SettleTenantReportEntity.
 *
 * Chuyển đổi `_id` (ObjectId) → `id` (hex string).
 * Tất cả field khác giữ nguyên kiểu — Date vẫn là Date.
 */
export class SettleTenantReportMapper extends MongoMapper<Document, SettleTenantReportEntity> {
  protected mapProps(doc: Document): SettleTenantReportEntity {
    const { _id, ...rest } = doc as any;

    return {
      id: _id.toHexString(),
      ...rest,
    } as SettleTenantReportEntity;
  }
}
