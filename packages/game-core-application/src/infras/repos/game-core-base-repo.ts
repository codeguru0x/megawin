import { MongoRepository, Constants } from "@megawin/data/mongo";
import type { BaseEntity, MongoMapper } from "@megawin/data/mongo";
import type { Document } from "mongodb";

export class GameCoreBaseRepo<
  TEntity extends BaseEntity,
  TDataMapper extends MongoMapper<Document, TEntity> | undefined = undefined,
> extends MongoRepository<TEntity, TDataMapper> {
  constructor({
    collName,
    dataMapper,
  }: {
    collName: string;
    dataMapper?: TDataMapper;
  }) {
    super({
      collName,
      dbName: Constants.Default.DbName,
      dataMapper,
    });
  }
}
