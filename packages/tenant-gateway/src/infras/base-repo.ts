/**
 * Base repo cho collection thuộc DB `megawin-tenant` trong package `tenant-gateway`.
 *
 * Mọi repo đọc/ghi `tx_logs` (hoặc collection khác trong DB `megawin-tenant`
 * sau này) extend class này để tránh lặp lại `dbName`.
 *
 * KHÔNG DÙNG CHO `TenantCallbackConfigRepo` (đọc `tenants` ở DB `megawin-identity`).
 *
 * Alias mỏng của {@link TenantRepo}.
 */

import type { BaseEntity } from "@megawin/data/mongo";
import { type MongoMapper, TenantRepo } from "@megawin/data/mongo";
import type { Document } from "mongodb";

export class TenantGatewayBaseRepo<
  TEntity extends BaseEntity,
  TDataMapper extends MongoMapper<Document, TEntity> | undefined = undefined,
> extends TenantRepo<TEntity, TDataMapper> {}
