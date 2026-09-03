import type { BaseEntity } from "@megawin/data/mongo";
import { type MongoMapper, ResultFeedRepo } from "@megawin/data/mongo";
import type { Document } from "mongodb";

/**
 * Base repo cho mọi collection ResultFeed (DB `megawin-resultfeed`).
 *
 * Alias mỏng của {@link ResultFeedRepo} — theo tiền lệ `BaseRepo` của mỗi game
 * (`packages/game-keno-application/src/infras/repos/base-repo.ts`).
 */
export class BaseRepo<
  TEntity extends BaseEntity,
  TDataMapper extends MongoMapper<Document, TEntity> | undefined = undefined,
> extends ResultFeedRepo<TEntity, TDataMapper> {}
