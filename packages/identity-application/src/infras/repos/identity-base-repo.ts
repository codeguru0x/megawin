import { MongoRepository, MongoMapper, Constants } from "@megawin/data/mongo";
import type { BaseEntity } from "@megawin/data/mongo";
import { Document } from "mongodb";

export class IdentityBaseRepo<
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
