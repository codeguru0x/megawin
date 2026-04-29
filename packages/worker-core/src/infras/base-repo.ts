import { Constants, MongoRepository } from "@megawin/data/mongo";
import type { BaseEntity, MongoMapper } from "@megawin/data/mongo";
import type { Document } from "mongodb";

/**
 * Base repository cho tất cả collections trong worker-core (DB mặc định `megawin`).
 *
 * Cùng pattern với `GameCoreBaseRepo` — kế thừa `MongoRepository` và pin DB name
 * về `Constants.Default.DbName`. Consumers chỉ cần truyền `collName` (+ optional mapper).
 */
export class WorkerCoreBaseRepo<
  TEntity extends BaseEntity,
  TDataMapper extends MongoMapper<Document, TEntity> | undefined = undefined,
> extends MongoRepository<TEntity, TDataMapper> {
  constructor({ collName, dataMapper }: { collName: string; dataMapper?: TDataMapper }) {
    super({
      collName,
      dbName: Constants.Default.DbName,
      dataMapper,
    });
  }
}
