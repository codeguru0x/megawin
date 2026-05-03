/**
 * Base repo cho collection thuộc DB `megawin-tenant` trong package `tenant-gateway`.
 *
 * Mọi repo đọc/ghi `tx_logs` (hoặc collection khác trong DB `megawin-tenant`
 * sau này) extend class này để tránh lặp lại `dbName`.
 *
 * KHÔNG DÙNG CHO `TenantCallbackConfigRepo` (nằm DB `megawin`, giữ nguyên
 * logic cũ).
 */

import { MongoRepository, MongoMapper, Constants } from "@megawin/data/mongo";
import type { BaseEntity } from "@megawin/data/mongo";
import type { Document } from "mongodb";

export class TenantGatewayBaseRepo<
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
