import { MongoMapper } from "@megawin/data/mongo";
import type { OutstandingDrawReportEntity } from "@megawin/game-keno/entities";
import type { Document } from "mongodb";

/**
 * Map MongoDB document (keno_outstanding_draw_reports) → OutstandingDrawReportEntity.
 *
 * Chuyển đổi `_id` (ObjectId) → `id` (hex string).
 * Tất cả field khác giữ nguyên kiểu — Date vẫn là Date.
 */
export class OutstandingDrawReportMapper extends MongoMapper<Document, OutstandingDrawReportEntity> {
  protected mapProps(doc: Document): OutstandingDrawReportEntity {
    const { _id, ...rest } = doc as any;

    return {
      id: _id.toHexString(),
      ...rest,
    } as OutstandingDrawReportEntity;
  }
}
