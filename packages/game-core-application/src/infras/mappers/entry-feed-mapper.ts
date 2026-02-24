import { MongoMapper } from "@megawin/data/mongo/mapper";
import type { EntryFeedEntity, EntryFeedItem } from "@megawin/game-core/entities";
import { longToString } from "@megawin/data/mongo/long";
import type { Document } from "mongodb";

/**
 * Map MongoDB document (entryFeed collection) → EntryFeedEntity.
 *
 * Xử lý chuyển đổi quan trọng:
 * - `_id` (ObjectId) → `id` (hex string).
 * - `version` (BSON Long) → `version` (string) via longToString().
 *
 * Tất cả field khác giữ nguyên kiểu (Date vẫn là Date ở entity layer,
 * chỉ chuyển thành ISO string ở API layer bởi toEntryFeedItem).
 */
export class EntryFeedMapper extends MongoMapper<Document, EntryFeedEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): EntryFeedEntity {
    const { _id, version, ...rest } = doc as any;

    return {
      id: _id.toHexString(),
      version: longToString(version),
      ...rest,
    } as EntryFeedEntity;
  }
}

/**
 * Convert EntryFeedEntity → EntryFeedItem cho API response.
 *
 * Chuyển đổi:
 * - Date → ISO 8601 string (drawTime, sourceUpdatedAt, feedCreatedAt).
 * - Loại bỏ tenantId vì tenant đã biết ID của mình (inject từ auth).
 * - version giữ nguyên string (đã convert từ Long ở mapper layer).
 *
 * Kết quả an toàn cho JSON.stringify, trả qua HTTP cho tenant.
 */
export function toEntryFeedItem(entity: EntryFeedEntity): EntryFeedItem {
  return {
    version: entity.version,
    gameProduct: entity.gameProduct,
    sourceEntryId: entity.sourceEntryId,
    ticketId: entity.ticketId,
    ticketNo: entity.ticketNo,
    playerId: entity.playerId,
    drawId: entity.drawId,
    drawTime: entity.drawTime.toISOString(),
    drawDate: entity.drawDate,
    status: entity.status,
    stakeAmount: entity.stakeAmount,
    winAmount: entity.winAmount,
    payoutAmount: entity.payoutAmount,
    netAmount: entity.netAmount,
    sourceUpdatedAt: entity.sourceUpdatedAt.toISOString(),
    feedCreatedAt: entity.feedCreatedAt.toISOString(),
  };
}
