import { Long } from "mongodb";
import type { Document } from "mongodb";
import { GameCoreCollections } from "@megawin/game-core/entities";
import type { GameProduct, EntryFeedDoc, EntryFeedEntity } from "@megawin/game-core/entities";
import { GameCoreBaseRepo } from "./game-core-base-repo";
import { EntryFeedMapper } from "../mappers/entry-feed-mapper";

/**
 * Repository cho collection entryFeed.
 *
 * Kế thừa đầy đủ insertOne, insertMany, findMany, paging... từ MongoRepository.
 * Thêm:
 * - pollFeed: tenant polling (Long → string conversion).
 * - upsertFeedEntry: worker sync ghi/cập nhật snapshot.
 */
export class EntryFeedRepository extends GameCoreBaseRepo<EntryFeedEntity, EntryFeedMapper> {
  constructor() {
    super({
      collName: GameCoreCollections.EntryFeed,
      dataMapper: new EntryFeedMapper(),
    });
  }

  /**
   * Poll feed entries cho tenant.
   *
   * Query: version > afterVersion, sorted ASC, limit N.
   * afterVersion là string → convert sang Long để query MongoDB.
   */
  async pollFeed(params: {
    tenantId: string;
    afterVersion: string;
    limit: number;
    gameProduct?: GameProduct;
  }): Promise<EntryFeedEntity[]> {
    const filter: Document = {
      tenantId: params.tenantId,
      version: { $gt: Long.fromString(params.afterVersion) },
    };

    if (params.gameProduct) {
      filter.gameProduct = params.gameProduct;
    }

    return await this.findMany(filter, {
      sort: { version: 1 },
      limit: params.limit,
    });
  }

  /**
   * Upsert 1 feed entry.
   *
   * Key: sourceEntryId (mỗi entry gốc chỉ có 1 document mới nhất trong feed).
   * Chỉ update nếu version mới > version cũ (idempotent, tránh ghi đè ngược).
   *
   * @returns true nếu đã upsert (insert hoặc update), false nếu skip (version cũ hơn).
   */
  async upsertFeedEntry(doc: Omit<EntryFeedDoc, "_id">): Promise<boolean> {
    const result = await this.findOneAndUpdate(
      {
        sourceEntryId: doc.sourceEntryId,
        version: { $lt: doc.version },
      },
      {
        $set: {
          version: doc.version,
          gameProduct: doc.gameProduct,
          ticketId: doc.ticketId,
          ticketNo: doc.ticketNo,
          tenantId: doc.tenantId,
          playerId: doc.playerId,
          username: doc.username,
          drawId: doc.drawId,
          drawTime: doc.drawTime,
          drawDate: doc.drawDate,
          financialDate: doc.financialDate,
          status: doc.status,
          outcome: doc.outcome,
          stakeAmount: doc.stakeAmount,
          winAmount: doc.winAmount,
          payoutAmount: doc.payoutAmount,
          netAmount: doc.netAmount,
          commissionRate: doc.commissionRate,
          commissionAmount: doc.commissionAmount,
          voidInfo: doc.voidInfo,
          betContent: doc.betContent,
          drawResult: doc.drawResult,
          payoutDetail: doc.payoutDetail,
          sourceUpdatedAt: doc.sourceUpdatedAt,
          feedCreatedAt: doc.feedCreatedAt,
        },
        $setOnInsert: {
          sourceEntryId: doc.sourceEntryId,
        },
      },
      { upsert: true, returnDocument: "after" },
    );

    return result !== null;
  }

  /**
   * Batch upsert nhiều feed entries.
   * Mỗi entry upsert riêng (ordered, idempotent).
   */
  async batchUpsertFeedEntries(
    docs: Omit<EntryFeedDoc, "_id">[],
  ): Promise<{ upserted: number; skipped: number }> {
    let upserted = 0;
    let skipped = 0;
    for (const doc of docs) {
      const success = await this.upsertFeedEntry(doc);
      if (success) upserted++;
      else skipped++;
    }
    return { upserted, skipped };
  }
}
