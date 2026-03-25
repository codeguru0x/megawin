import { Long } from "mongodb";
import type { AnyBulkWriteOperation, Document } from "mongodb";
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
   * Bulk upsert nhiều feed entries trong 1 MongoDB bulkWrite (unordered).
   *
   * Key: entryId. Chỉ ghi đè nếu version mới > version cũ (idempotent).
   * ordered: false — tối đa hoá throughput, lỗi 1 entry không chặn các entry khác.
   */
  async bulkUpsertFeedEntries(
    docs: Omit<EntryFeedDoc, "_id">[],
  ): Promise<{ upserted: number; skipped: number }> {
    if (docs.length === 0) {
      return { upserted: 0, skipped: 0 };
    }

    const operations: AnyBulkWriteOperation<Document>[] = docs.map(
      (doc: Omit<EntryFeedDoc, "_id">) => {
        const { entryId, ...setFields } = doc;
        return {
          updateOne: {
            filter: {
              entryId,
              version: { $lt: doc.version },
            },
            update: {
              $set: setFields,
              $setOnInsert: { entryId },
            },
            upsert: true,
          },
        };
      },
    );

    const result = await this.bulkWrite(operations, { ordered: false });

    // modifiedCount = entries đã tồn tại và được cập nhật (version mới hơn)
    // upsertedCount = entries mới (insert lần đầu)
    // docs.length - modifiedCount - upsertedCount = entries bị skip (version cũ hơn hoặc bằng)
    const written = result.modifiedCount + result.upsertedCount;
    return {
      upserted: written,
      skipped: docs.length - written,
    };
  }
}
