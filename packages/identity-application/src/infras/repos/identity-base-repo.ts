import type { BaseEntity } from "@megawin/data/mongo";
import { IdentityRepo, type MongoMapper } from "@megawin/data/mongo";
import type { Document } from "mongodb";

/**
 * Base repo cho identity (`accounts`, `tenants`) — DB `megawin-identity`.
 *
 * Alias mỏng của {@link IdentityRepo} — giữ tên cũ để không phải sửa import.
 */
export class IdentityBaseRepo<
  TEntity extends BaseEntity,
  TDataMapper extends MongoMapper<Document, TEntity> | undefined = undefined,
> extends IdentityRepo<TEntity, TDataMapper> {}
