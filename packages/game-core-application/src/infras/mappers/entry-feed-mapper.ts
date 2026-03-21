import { MongoMapper, longToString } from "@megawin/data/mongo";
import type {
  EntryFeedEntity,
  BetsFeedItem,
  FeedVoidInfo,
  FeedVoidInfoItem,
} from "@megawin/game-core/entities";
import type { Document } from "mongodb";

/**
 * Map MongoDB document (entryFeed collection) → EntryFeedEntity.
 *
 * Xử lý chuyển đổi quan trọng:
 * - `_id` (ObjectId) → `id` (hex string).
 * - `version` (BSON Long) → `version` (string) via longToString().
 *
 * Tất cả field khác giữ nguyên kiểu (Date vẫn là Date ở entity layer,
 * chỉ chuyển thành ISO string ở API layer bởi toBetsFeedItem).
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
 * Convert FeedVoidInfo (Date) → FeedVoidInfoItem (string) cho API response.
 */
function mapVoidInfoItem(v: FeedVoidInfo): FeedVoidInfoItem {
  return {
    originalAmount: v.originalAmount,
    refundAmount: v.refundAmount,
    refundStatus: v.refundStatus,
    voidedAt: v.voidedAt.toISOString(),
  };
}

/**
 * Convert EntryFeedEntity → BetsFeedItem cho API response.
 *
 * Chuyển đổi:
 * - Date → ISO 8601 string (drawTime, sourceUpdatedAt, feedCreatedAt, voidInfo.voidedAt).
 * - Loại bỏ tenantId vì tenant đã biết ID của mình (inject từ auth).
 * - version giữ nguyên string (đã convert từ Long ở mapper layer).
 * - betContent / drawResult / payoutDetail truyền nguyên vẹn (opaque unknown).
 *
 * Kết quả an toàn cho JSON.stringify, trả qua HTTP cho tenant.
 */
export function toBetsFeedItem(entity: EntryFeedEntity): BetsFeedItem {
  return {
    version: entity.version,
    gameProduct: entity.gameProduct,
    sourceEntryId: entity.sourceEntryId,
    ticketId: entity.ticketId,
    ticketNo: entity.ticketNo,
    playerId: entity.playerId,
    username: entity.username,
    drawId: entity.drawId,
    drawTime: entity.drawTime.toISOString(),
    drawDate: entity.drawDate,
    financialDate: entity.financialDate,
    status: entity.status,
    outcome: entity.outcome,
    stakeAmount: entity.stakeAmount,
    winAmount: entity.winAmount,
    payoutAmount: entity.payoutAmount,
    netAmount: entity.netAmount,
    commissionRate: entity.commissionRate,
    commissionAmount: entity.commissionAmount,
    voidInfo: entity.voidInfo ? mapVoidInfoItem(entity.voidInfo) : undefined,
    betContent: entity.betContent,
    drawResult: entity.drawResult,
    payoutDetail: entity.payoutDetail,
    sourceUpdatedAt: entity.sourceUpdatedAt.toISOString(),
    feedCreatedAt: entity.feedCreatedAt.toISOString(),
  };
}

/** @deprecated Dùng toBetsFeedItem thay thế. */
export const toEntryFeedItem = toBetsFeedItem;
