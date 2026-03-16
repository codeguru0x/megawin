import { MongoMapper } from "@megawin/data/mongo";
import type { SettleDrawReportEntity } from "@megawin/game-max3dpro/entities";
import type { Document } from "mongodb";

/**
 * Map MongoDB document (max3dpro_settle_draw_reports) → SettleDrawReportEntity.
 *
 * Chuyển đổi `_id` (ObjectId) → `id` (hex string).
 * Tất cả field khác giữ nguyên kiểu — Date vẫn là Date.
 */
export class SettleDrawReportMapper extends MongoMapper<Document, SettleDrawReportEntity> {
  protected mapProps(doc: Document): SettleDrawReportEntity {
    const { _id, ...rest } = doc as any;

    return {
      id: _id.toHexString(),
      ...rest,
    } as SettleDrawReportEntity;
  }
}
