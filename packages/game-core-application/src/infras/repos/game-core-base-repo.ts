import type { BaseEntity } from "@megawin/data/mongo/base-entity";
import { MongoRepository } from "@megawin/data/mongo/repository";
import type { MongoMapper } from "@megawin/data/mongo/mapper";
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
      dbName: "megawin",
      dataMapper,
    });
  }
}
