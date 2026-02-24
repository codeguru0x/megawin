import { Long } from "mongodb";
import type { Document } from "mongodb";
import { GameCoreCollections } from "@megawin/game-core/entities";
import type {
  GameProduct,
  EntryFeedEntity,
} from "@megawin/game-core/entities";
import { GameCoreBaseRepo } from "./game-core-base-repo";
import { EntryFeedMapper } from "../mappers/entry-feed-mapper";

/**
 * Repository cho collection entryFeed.
 *
 * Kế thừa đầy đủ insertOne, insertMany, findMany, paging... từ MongoRepository.
 * Chỉ thêm method pollFeed đặc thù cho tenant polling (Long conversion).
 */
export class EntryFeedRepository extends GameCoreBaseRepo<
  EntryFeedEntity,
  EntryFeedMapper
> {
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
   *
   * @returns entities với version đã là string (safe cho JSON).
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
}
