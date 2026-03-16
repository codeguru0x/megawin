import { MongoMapper } from "@megawin/data/mongo";
import type { VoidDrawReportEntity } from "@megawin/game-lotto535/entities";
import type { Document } from "mongodb";

/**
 * Map MongoDB document (lotto535_void_draw_reports) → VoidDrawReportEntity.
 *
 * Chuyển đổi `_id` (ObjectId) → `id` (hex string).
 * Tất cả field khác giữ nguyên kiểu — Date vẫn là Date.
 */
export class VoidDrawReportMapper extends MongoMapper<Document, VoidDrawReportEntity> {
  protected mapProps(doc: Document): VoidDrawReportEntity {
    const { _id, ...rest } = doc as any;

    return {
      id: _id.toHexString(),
      ...rest,
    } as VoidDrawReportEntity;
  }
}
