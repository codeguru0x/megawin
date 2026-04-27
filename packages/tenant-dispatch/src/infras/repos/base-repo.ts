import { MongoRepository, MongoMapper, Constants } from "@megawin/data/mongo";
import type { BaseEntity } from "@megawin/data/mongo";
import { Document } from "mongodb";

/**
 * Base repository cho tenant-dispatch — trỏ vào DB `megawin-tenant`.
 *
 * Tất cả repo trong package này kế thừa từ đây để đảm bảo ghi đúng DB,
 * không lẫn với DB `megawin` mặc định.
 */
export class TenantDispatchBaseRepo<
  TEntity extends BaseEntity,
  TDataMapper extends MongoMapper<Document, TEntity> | undefined = undefined,
> extends MongoRepository<TEntity, TDataMapper> {
  constructor({ collName, dataMapper }: { collName: string; dataMapper?: TDataMapper }) {
    super({
      collName,
      dbName: Constants.Default.MegawinTenantDbName,
      dataMapper,
    });
  }
}
